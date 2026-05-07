// Pure Node.js PNG icon generator — no dependencies
import { createWriteStream } from 'fs'
import { deflateSync } from 'zlib'

function makePng(size, maskable = false) {
  const w = size, h = size

  // Build raw RGBA pixel data
  const raw = Buffer.alloc(h * (1 + w * 4)) // 1 filter byte per row

  for (let y = 0; y < h; y++ ) {
    raw[y * (1 + w * 4)] = 0 // filter: None
    for (let x = 0; x < w; x++ ) {
      const off = y * (1 + w * 4) + 1 + x * 4

      // Normalised coords
      const nx = (x - w / 2) / (w / 2)
      const ny = (y - h / 2) / (h / 2)
      const dist = Math.sqrt(nx * nx + ny * ny)

      // Background
      let r = 17, g = 24, b = 39, a = 255 // gray-900

      if (maskable) {
        // Maskable: full bleed dark bg, purple circle
        r = 17; g = 24; b = 39
        if (dist < 0.72) { r = 124; g = 58; b = 237 }   // brand purple
        if (dist < 0.55) { r = 8;   g = 145; b = 178 }   // brand cyan (inner)
      } else {
        // Standard: rounded rect dark bg
        const rx = Math.abs(nx), ry = Math.abs(ny)
        const corner = 0.22
        const inBg = rx < 0.93 && ry < 0.93 &&
          !(rx > (0.93 - corner) && ry > (0.93 - corner) &&
            Math.sqrt((rx-(0.93-corner))**2 + (ry-(0.93-corner))**2) > corner)

        if (!inBg) { a = 0 }
        else if (dist < 0.68) { r = 124; g = 58; b = 237 }
        else { r = 17; g = 24; b = 39 }

        // Flask shape (simplified)
        const fx = nx * w / 2, fy = ny * h / 2
        const neck = Math.abs(fx) < w * 0.09 && fy < -h * 0.08
        const body = Math.abs(fx) < (w * 0.22 + (fy + h * 0.08) * 0.38) && fy > -h * 0.08 && fy < h * 0.28
        const liquid = body && fy > h * 0.05

        if (inBg) {
          if (neck) { r = 255; g = 255; b = 255 }
          else if (liquid) { r = 8; g = 145; b = 178; a = 220 }
          else if (body) { r = 50; g = 60; b = 80 }
          else { r = 17; g = 24; b = 39 }
        }
      }

      raw[off]     = r
      raw[off + 1] = g
      raw[off + 2] = b
      raw[off + 3] = a
    }
  }

  const compressed = deflateSync(raw)

  function chunk(type, data) {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type)
    const crcData = Buffer.concat([typeB, data])
    let c = 0xFFFFFFFF
    for (const b of crcData) {
      c ^= b
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0)
    }
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE((c ^ 0xFFFFFFFF) >>> 0)
    return Buffer.concat([len, typeB, data, crc])
  }

  const sig = Buffer.from([137,80,78,71,13,10,26,10])

  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(w, 0)
  ihdrData.writeUInt32BE(h, 4)
  ihdrData[8] = 8   // bit depth
  ihdrData[9] = 6   // RGBA
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdrData),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function write(path, buf) {
  const ws = createWriteStream(path)
  ws.write(buf)
  ws.end()
  console.log('wrote', path, buf.length, 'bytes')
}

write('public/icons/icon-192.png',          makePng(192, false))
write('public/icons/icon-512.png',          makePng(512, false))
write('public/icons/icon-512-maskable.png', makePng(512, true))
