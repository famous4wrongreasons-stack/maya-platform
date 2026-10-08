// Local macOS OCR processing edge. No paths, URLs, network or persistence API.
// The caller owns the wall-time/concurrency limit and supplies normalized PNG.
import Foundation
import Vision
import ImageIO
import CoreGraphics
import Darwin

private let maximumInputBytes = 16 * 1024 * 1024
private let maximumPixels = 12_000_000
private let maximumWords = 4_000
private let maximumWordUTF16 = 256
private let maximumOutputBytes = 256 * 1024
private let languages = ["ru-RU", "en-US"]

private enum Failure: String, Error {
    case arguments = "goods_photo_ocr_arguments_refused"
    case input = "goods_photo_ocr_input_invalid"
    case inputLimit = "goods_photo_ocr_input_limit"
    case image = "goods_photo_ocr_image_invalid"
    case pixels = "goods_photo_ocr_pixel_limit"
    case languages = "goods_photo_ocr_languages_unavailable"
    case recognition = "goods_photo_ocr_recognition_failed"
    case result = "goods_photo_ocr_result_invalid"
    case words = "goods_photo_ocr_word_limit"
    case text = "goods_photo_ocr_text_limit"
    case output = "goods_photo_ocr_output_limit"
    case io = "goods_photo_ocr_io_failed"
}

private struct Word: Encodable {
    let text: String
    let left: Double
    let top: Double
    let width: Double
    let height: Double
    // Confidence belongs to the recognized candidate; it is not calibrated
    // confidence in a numeric field, a product match, or a business action.
    let confidence: Double
}

private struct Result: Encodable {
    let contract = "maya.local-vision.words/1"
    let image_width: Int
    let image_height: Int
    let languages: [String]
    let revision = 3
    let words: [Word]
}

private func readPNG() throws -> Data {
    var bytes = Data()
    do {
        while let chunk = try FileHandle.standardInput.read(upToCount: 64 * 1024), !chunk.isEmpty {
            guard chunk.count <= maximumInputBytes - bytes.count else { throw Failure.inputLimit }
            bytes.append(chunk)
        }
    } catch let failure as Failure {
        throw failure
    } catch {
        throw Failure.io
    }
    guard bytes.count >= 12,
          bytes.prefix(8).elementsEqual([137, 80, 78, 71, 13, 10, 26, 10]) else {
        throw Failure.input
    }
    return bytes
}

private func integerProperty(_ properties: [CFString: Any], _ key: CFString) throws -> Int {
    guard let value = properties[key] as? NSNumber else { throw Failure.image }
    let number = value.doubleValue
    guard number.isFinite, number > 0, number.rounded(.towardZero) == number,
          number <= Double(maximumPixels) else { throw Failure.pixels }
    return Int(number)
}

private func image(_ bytes: Data) throws -> CGImage {
    let metadataOptions = [kCGImageSourceShouldCache: false] as CFDictionary
    guard let source = CGImageSourceCreateWithData(bytes as CFData, metadataOptions),
          CGImageSourceGetType(source) as String? == "public.png",
          CGImageSourceGetCount(source) == 1,
          CGImageSourceGetStatus(source) == .statusComplete,
          CGImageSourceGetStatusAtIndex(source, 0) == .statusComplete,
          let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, metadataOptions) as? [CFString: Any] else {
        throw Failure.image
    }
    let width = try integerProperty(properties, kCGImagePropertyPixelWidth)
    let height = try integerProperty(properties, kCGImagePropertyPixelHeight)
    guard width <= maximumPixels / height else { throw Failure.pixels }
    // Caller normalizes orientation. A hidden EXIF transform would make word
    // coordinates disagree with the declared dimensions, so refuse it here.
    if let orientation = properties[kCGImagePropertyOrientation] as? NSNumber,
       orientation.doubleValue != 1 { throw Failure.image }
    guard let decoded = CGImageSourceCreateImageAtIndex(source, 0, metadataOptions),
          decoded.width == width, decoded.height == height else { throw Failure.image }
    return decoded
}

private func word(_ range: Range<String.Index>, candidate: VNRecognizedText) throws -> Word {
    let value = String(candidate.string[range])
    guard !value.isEmpty, value.utf16.count <= maximumWordUTF16 else { throw Failure.text }
    guard !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
        throw Failure.result
    }
    let confidence = Double(candidate.confidence)
    guard confidence.isFinite, (0...1).contains(confidence) else { throw Failure.result }
    let rectangle: VNRectangleObservation?
    do { rectangle = try candidate.boundingBox(for: range) }
    catch { throw Failure.result }
    guard let bounds = rectangle?.boundingBox else { throw Failure.result }
    let coordinates = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY]
    // Only floating point edge noise may be clipped; no fallback line box or
    // invented per-word coordinates are supplied when Vision has no word box.
    let epsilon = 0.000001
    guard coordinates.allSatisfy({ $0.isFinite && Double($0) >= -epsilon && Double($0) <= 1 + epsilon }),
          bounds.width > 0, bounds.height > 0 else { throw Failure.result }
    let left = max(0, Double(bounds.minX))
    let right = min(1, Double(bounds.maxX))
    let bottom = max(0, Double(bounds.minY))
    let upper = min(1, Double(bounds.maxY))
    guard right > left, upper > bottom else { throw Failure.result }
    return Word(text: value, left: left, top: 1 - upper,
                width: right - left, height: upper - bottom, confidence: confidence)
}

private func recognize(_ image: CGImage) throws -> [Word] {
    let request = VNRecognizeTextRequest()
    request.revision = VNRecognizeTextRequestRevision3
    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages
    request.usesLanguageCorrection = false
    request.automaticallyDetectsLanguage = false
    request.customWords = []
    do {
        let supported = try request.supportedRecognitionLanguages()
        guard languages.allSatisfy({ supported.contains($0) }) else { throw Failure.languages }
    } catch { throw Failure.languages }
    do {
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
    } catch { throw Failure.recognition }
    guard let observations = request.results else { throw Failure.result }
    guard observations.count <= maximumWords else { throw Failure.words }
    var words: [Word] = []
    var recognizedCharacters = 0
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { throw Failure.result }
        let text = candidate.string
        recognizedCharacters += text.utf16.count
        guard recognizedCharacters <= maximumWords * maximumWordUTF16 else { throw Failure.text }
        var start: String.Index?
        // Non-whitespace ranges preserve punctuation and literal numeric text.
        // Vision's word box is requested for each actual substring range.
        for index in text.indices {
            if text[index].isWhitespace {
                if let lower = start {
                    guard words.count < maximumWords else { throw Failure.words }
                    words.append(try word(lower..<index, candidate: candidate))
                    start = nil
                }
            } else if start == nil { start = index }
        }
        if let lower = start {
            guard words.count < maximumWords else { throw Failure.words }
            words.append(try word(lower..<text.endIndex, candidate: candidate))
        }
    }
    return words
}

private func run() throws -> Data {
    guard CommandLine.arguments.count == 1 else { throw Failure.arguments }
    var bytes = try readPNG()
    defer { bytes.resetBytes(in: 0..<bytes.count) }
    let decoded = try image(bytes)
    let result = Result(image_width: decoded.width, image_height: decoded.height,
                        languages: languages, words: try recognize(decoded))
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    let output: Data
    do { output = try encoder.encode(result) }
    catch { throw Failure.result }
    guard output.count < maximumOutputBytes else { throw Failure.output }
    var terminated = output
    terminated.append(10)
    return terminated
}

do {
    let output = try autoreleasepool { try run() }
    do { try FileHandle.standardOutput.write(contentsOf: output) }
    catch { throw Failure.io }
} catch {
    let code = (error as? Failure)?.rawValue ?? Failure.recognition.rawValue
    // Never emit exception descriptions, OCR text, paths or raw input bytes.
    try? FileHandle.standardError.write(contentsOf: Data((code + "\n").utf8))
    exit(2)
}
