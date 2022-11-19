import { jsonToFig } from './fig2json'
import designInJson from './design.json'
import fs from 'fs'

console.log('starting conversion')
// console.log(designInJson)
// console.log(jsonToFig)
const f = async () => {
  const uint8Array: Uint8Array = await jsonToFig(designInJson)
  const b64encoded = btoa(String.fromCharCode(...uint8Array))
  const dataStr = "data:application/x-figma;base64," + b64encoded

  fs.writeFileSync("result.fig", dataStr);
  // console.log(result)
}

f().then()
