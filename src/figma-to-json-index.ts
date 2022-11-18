import { jsonToFig } from './fig2json'
import designInJson from './design.json'

console.log('starting conversion')
// console.log(designInJson)
// console.log(jsonToFig)
const result = jsonToFig(designInJson)
console.log(result)
