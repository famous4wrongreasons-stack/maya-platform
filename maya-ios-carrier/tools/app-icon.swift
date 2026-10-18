// Packaging conversion only: use the approved Maya artwork without redrawing it.
// No network, signing, installation or product behaviour.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CryptoKit

guard CommandLine.arguments.count == 3 else {
    fatalError("usage: swift app-icon.swift APPROVED_LOGO.png OUTPUT.png")
}
let source = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
let expectedSource = "53d4b9fb9aa48915d89d88b5fc945568afa1aa7f532475c34333b8096bc41600"
guard let sourceBytes = try? Data(contentsOf: source),
      SHA256.hash(data: sourceBytes).map({ String(format: "%02x", $0) }).joined() == expectedSource
else { fatalError("approved Maya source hash required") }
guard let input = CGImageSourceCreateWithURL(source as CFURL, nil),
      let logo = CGImageSourceCreateImageAtIndex(input, 0, nil),
      logo.width == 1254, logo.height == 1254,
      let rgb = CGColorSpace(name: CGColorSpace.sRGB),
      let canvas = CGContext(data: nil, width: 1024, height: 1024,
                             bitsPerComponent: 8, bytesPerRow: 4096, space: rgb,
                             bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)
else { fatalError("approved square artwork required") }
// iOS applies its own corner mask. Keep a full opaque square, no baked-in corners.
canvas.setFillColor(CGColor(gray: 1, alpha: 1))
canvas.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
canvas.interpolationQuality = .high
canvas.draw(logo, in: CGRect(x: 0, y: 0, width: 1024, height: 1024))
guard let image = canvas.makeImage(),
      let writer = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)
else { fatalError("icon output unavailable") }
CGImageDestinationAddImage(writer, image, nil)
guard CGImageDestinationFinalize(writer) else { fatalError("icon output failed") }
