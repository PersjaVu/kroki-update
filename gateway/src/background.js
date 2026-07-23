import { PNG } from 'pngjs'

const colors = {
  white: [255, 255, 255],
  black: [0, 0, 0]
}

export function normalizeBackground(value) {
  const mode = String(value || 'transparent').toLowerCase()
  if (!['white', 'black', 'transparent'].includes(mode)) {
    const error = new Error('background must be white, black, or transparent')
    error.status = 400
    throw error
  }
  return mode
}

export function applySvgBackground(body, mode) {
  const background = normalizeBackground(mode)
  let svg = Buffer.isBuffer(body) ? body.toString('utf8') : String(body)
  svg = svg.replace(/<rect\b[^>]*data-code-to-uml-background=["']true["'][^>]*\/?>/i, '')
  if (background === 'transparent') return Buffer.from(svg, 'utf8')
  const fill = background === 'white' ? '#ffffff' : '#000000'
  const opening = svg.match(/<svg\b[^>]*>/i)
  if (!opening) throw new Error('Renderer did not return a valid SVG image')
  const rect = `<rect width="100%" height="100%" fill="${fill}" data-code-to-uml-background="true"/>`
  return Buffer.from(svg.slice(0, opening.index + opening[0].length) + rect + svg.slice(opening.index + opening[0].length), 'utf8')
}

export function applyPngBackground(body, mode) {
  const background = normalizeBackground(mode)
  if (background === 'transparent') return Buffer.from(body)
  const png = PNG.sync.read(Buffer.from(body))
  const [red, green, blue] = colors[background]
  for (let index = 0; index < png.data.length; index += 4) {
    const alpha = png.data[index + 3] / 255
    png.data[index] = Math.round(png.data[index] * alpha + red * (1 - alpha))
    png.data[index + 1] = Math.round(png.data[index + 1] * alpha + green * (1 - alpha))
    png.data[index + 2] = Math.round(png.data[index + 2] * alpha + blue * (1 - alpha))
    png.data[index + 3] = 255
  }
  return PNG.sync.write(png)
}

export function applyBackground(body, format, mode) {
  const background = normalizeBackground(mode)
  if (format === 'svg') return applySvgBackground(body, background)
  if (format === 'png') return applyPngBackground(body, background)
  if (background !== 'transparent') {
    const error = new Error(`background is only supported for SVG and PNG exports, not ${format}`)
    error.status = 400
    throw error
  }
  return Buffer.from(body)
}
