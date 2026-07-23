import test from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { applyPngBackground, applySvgBackground } from '../src/background.js'

test('SVG backgrounds are explicit and idempotent', () => {
  const source = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><circle cx="5" cy="5" r="4"/></svg>')
  const white = applySvgBackground(source, 'white').toString()
  assert.match(white, /<svg[^>]*><rect width="100%" height="100%" fill="#ffffff" data-code-to-uml-background="true"\/><circle/)
  const black = applySvgBackground(Buffer.from(white), 'black').toString()
  assert.equal((black.match(/data-code-to-uml-background/g) || []).length, 1)
  assert.match(black, /fill="#000000"/)
  assert.doesNotMatch(applySvgBackground(Buffer.from(black), 'transparent').toString(), /data-code-to-uml-background/)
})

test('PNG solid backgrounds flatten alpha while transparent preserves it', () => {
  const png = new PNG({ width:1, height:1 })
  png.data.set([255, 0, 0, 128])
  const source = PNG.sync.write(png)
  const transparent = PNG.sync.read(applyPngBackground(source, 'transparent'))
  assert.equal(transparent.data[3], 128)
  const white = PNG.sync.read(applyPngBackground(source, 'white'))
  assert.deepEqual([...white.data], [255, 127, 127, 255])
  const black = PNG.sync.read(applyPngBackground(source, 'black'))
  assert.deepEqual([...black.data], [128, 0, 0, 255])
})
