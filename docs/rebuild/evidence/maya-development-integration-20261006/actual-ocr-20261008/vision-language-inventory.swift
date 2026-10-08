import Foundation
import Vision
var levels: [[String: Any]] = []
for (label, level) in [("accurate", VNRequestTextRecognitionLevel.accurate), ("fast", VNRequestTextRecognitionLevel.fast)] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    let languages = try request.supportedRecognitionLanguages()
    levels.append(["level": label, "requestRevision": request.revision, "languages": languages])
}
let result: [String: Any] = ["operation": "supportedRecognitionLanguages_only", "imageInputs": 0, "recognitionRequestsPerformed": 0, "supportedRevisions": VNRecognizeTextRequest.supportedRevisions.map { $0 }, "levels": levels]
let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data("\n".utf8))
