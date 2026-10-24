// Turns the single-file build into the page fragment the hosted preview expects.
import { readFileSync, writeFileSync } from 'node:fs';
const html = readFileSync('dist-preview/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
writeFileSync('dist-preview/turncloak-preview.html', `${head}\n<style>:root{color-scheme:dark}html,body{background:#0b0708;height:100%}</style>\n${body}`);
console.log('wrote dist-preview/turncloak-preview.html');
