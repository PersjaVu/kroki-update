import fs from 'node:fs'
import path from 'node:path'

const required=['CTU_SERVER','CTU_ENGINE','CTU_FORMAT','CTU_SOURCE','CTU_OUTPUT']
for(const name of required)if(!process.env[name])throw new Error(`${name} is required in render mode.`)
const headers={'Content-Type':'text/plain'}
if(process.env.CTU_API_KEY)headers.Authorization=`Bearer ${process.env.CTU_API_KEY}`
const source=fs.readFileSync(process.env.CTU_SOURCE)
const background=process.env.CTU_BACKGROUND||'white'
if(!['white','black','transparent'].includes(background))throw new Error('CTU_BACKGROUND must be white, black, or transparent.')
const supportsBackground=['svg','png'].includes(process.env.CTU_FORMAT)
const url=`${process.env.CTU_SERVER.replace(/\/$/,'')}/${process.env.CTU_ENGINE}/${process.env.CTU_FORMAT}${supportsBackground?`?background=${background}`:''}`
const response=await fetch(url,{method:'POST',headers,body:source})
if(!response.ok)throw new Error(`Render failed: HTTP ${response.status} ${await response.text()}`)
const output=path.resolve(process.env.CTU_OUTPUT)
fs.mkdirSync(path.dirname(output),{recursive:true})
fs.writeFileSync(output,Buffer.from(await response.arrayBuffer()))
console.log(`Rendered ${process.env.CTU_ENGINE}/${process.env.CTU_FORMAT} to ${output}`)
