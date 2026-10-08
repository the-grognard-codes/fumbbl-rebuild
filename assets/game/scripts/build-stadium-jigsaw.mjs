import {readFile,writeFile} from 'node:fs/promises';
import {validateJigsawCatalog} from './stadium-jigsaw-catalog.mjs';
const root=new URL('../pitch/stadiums/jigsaw/',import.meta.url);
const catalog=await validateJigsawCatalog(JSON.parse(await readFile(new URL('catalog.json',root),'utf8')),root);
const output=new URL('../../../browser-client/src/generated-stadium-jigsaw.ts',import.meta.url);
const code='// Generated from canonical jigsaw originals and measured regions. Run assets:sync.\n'
  +'export const jigsawCatalog = '+JSON.stringify(catalog,null,2)+' as const;\n';
if(process.argv.includes('--check')) {
  if(await readFile(output,'utf8')!==code)throw Error('Jigsaw catalog is stale. Run assets:sync.');
} else await writeFile(output,code);
console.log('Validated jigsaw stadium families:',Object.keys(catalog.families).join(', '));
