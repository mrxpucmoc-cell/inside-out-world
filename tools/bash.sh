node tools/gen.js > data/items_generated.json
# затем склеить с ручными:
node -e "
  const manual = require('./data/items.json');
  const gen = require('./data/items_generated.json');
  const merged = { ...manual, ...gen };
  console.log(JSON.stringify(merged, null, 2));
" > data/items_full.json
mv data/items_full.json data/items.json