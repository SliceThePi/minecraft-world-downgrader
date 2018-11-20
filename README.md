# minecraft-world-downgrader
A Node.JS-based app to downgrade Minecraft worlds from 1.13 to 1.12.

The file `nbt.js` was written by GitHub user [sjmulder](https://github.com/sjmulder/nbt-js) and modified to allow longArray values.

The file `biome-mapping.json` is a mapping of 1.13 biome IDs to their closest 1.12 equivalent, and likewise with `block-mapping.json` for blocks. I made these, and you can use them for whatever you like without providing credit as long as you don't claim that you're the one who created them.

## INSTALLATION
This has only been tested with [Node.JS](https://nodejs.org/) 10.4.1 installed. No guarantees that it'll work with other versions. Actually, no guarantees that it'll work at all.
```
git clone https://github.com/SliceThePi/minecraft-world-downgrader
cd minecraft-world-downgrader
npm install
```

## USAGE
Step 1: Make a backup.
Step 2:
```
cd minecraft-world-downgrader
node . path/to/1.13/world path/to/new/world
```

## LIMITATIONS
(Temporary! These can all be fixed. Just a tad more effort than I'm willing to put in at the moment):
- **May not actually work**
- Buttons, beds, levers, and noteblocks are not quite properly preserved
- Redstone torches will all be lit after the downgrade
- Redstone repeaters, comparators, and lamps will all be unlit after the downgrade
- Nighttime detectors (inverted daylight detectors) will become daylight detectors
- Flowerpots will be empty after the upgrade
- Giant mushrooms will have faces on every side
- Mushroom stems will always be red mushroom stems
- Skulls will always be skeleton skulls
- Prismarine-related stairs and slabs become purpur stairs
- Banners will all have a black base
- **Full slabs will become bottom-half slabs**
- Directly copies `level.dat` and doesn't copy `playerdata`, etc.

## TODO
- Fix the stuff listed under Limitations
- Make `nbt-cleaner.js` List functionality not-gross.
