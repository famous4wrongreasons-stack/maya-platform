// SCRATCH SYNTHETIC-ONLY DIAGNOSTIC CLONE. Never expose this stderr in production.
// The paired runner accepts only the hashed generated Russian fixture.
// Local macOS OCR processing edge. No paths, URLs, network or persistence API.
// The caller owns the wall-time/concurrency limit and supplies normalized PNG.
import Foundation
import Vision
import ImageIO
import CoreGraphics
import Darwin
import CoreML
import CryptoKit

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

private func diagnostic(_ event: String, details: [String: Any]) {
    let value: [String: Any] = ["contract": "maya.synthetic-vision-diagnostic/1", "event": event, "details": details]
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), data.count < 16000 {
        try? FileHandle.standardError.write(contentsOf: data)
        try? FileHandle.standardError.write(contentsOf: Data([10]))
    }
}

private func errorDetails(_ error: NSError, depth: Int = 0) -> [String: Any] {
    var value: [String: Any] = ["domain": String(error.domain.prefix(256)), "code": error.code,
        "description": String(error.localizedDescription.prefix(1024))]
    if let reason = error.localizedFailureReason { value["failureReason"] = String(reason.prefix(1024)) }
    if let recovery = error.localizedRecoverySuggestion { value["recoverySuggestion"] = String(recovery.prefix(512)) }
    if depth < 3, let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
        value["underlying"] = errorDetails(underlying, depth: depth + 1)
    }
    return value
}

private func configureDiagnosticCPU(_ request: VNRecognizeTextRequest) throws {
    // Optional investigation only; the default diagnostic changes no compute setting.
    guard CommandLine.arguments.last == "--cpu" else { return }
    guard #available(macOS 14.0, *) else { throw Failure.recognition }
    do {
        let supported = try request.supportedComputeStageDevices
        guard !supported.isEmpty else { throw Failure.recognition }
        for (stage, devices) in supported.sorted(by: { String(describing: $0.key) < String(describing: $1.key) }) {
            diagnostic("supported_compute_stage", details: ["stage": String(describing: stage),
                "devices": devices.prefix(16).map { String($0.description.prefix(256)) }])
            guard let cpu = devices.first(where: { if case .cpu = $0 { return true }; return false }) else {
                diagnostic("no_supported_cpu", details: ["stage": String(describing: stage)])
                throw Failure.recognition
            }
            request.setComputeDevice(cpu, for: stage)
        }
    } catch {
        diagnostic("compute_configuration_error", details: errorDetails(error as NSError))
        throw Failure.recognition
    }
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
    } catch {
        diagnostic("supported_languages_error", details: errorDetails(error as NSError))
        throw Failure.languages
    }
    try configureDiagnosticCPU(request)
    do {
        try VNImageRequestHandler(cgImage: image, orientation: .up, options: [:]).perform([request])
    } catch {
        diagnostic("perform_error", details: errorDetails(error as NSError))
        throw Failure.recognition
    }
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
    let args = CommandLine.arguments
    guard (args.count == 3 || (args.count == 4 && args[3] == "--cpu")),
          args[1] == "--synthetic-diagnostic", args[2].range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else { throw Failure.arguments }
    var bytes = try readPNG()
    let actualHash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    guard actualHash == args[2] else { throw Failure.input }
    diagnostic("synthetic_input", details: ["sha256": actualHash, "bytes": bytes.count, "cpuRequested": args.count == 4])
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
