const path = require("path");
const fs = require("fs").promises;
const RegionFile = require("prismarine-provider-anvil/src/region");
const prismarineNbt = require("prismarine-nbt");
const minecraftData = require("minecraft-data");
const nbt = require("./nbt");
const nbtCleaner = require("./nbt-cleaner");

const biomeMapping = require("./biome-mapping.json");
const blockMapping = require("./block-mapping.json");

const data12 = minecraftData("1.12.2");
const data13 = minecraftData("1.13.2");

// something wasn't working with prismarine-nbt's parse function so i'm using my own
prismarineNbt.parseUncompressed = nbtCleaner.decodeUncompressed;
prismarineNbt.writeUncompressed = nbtCleaner.encodeUncompressed;

const subfolders = ["region/", "DIM1/", "DIM-1/"];

function logSyntax(reason) {
    console.error("Syntax: node . <path/to/1.13 world> <path/to/new 1.12 world>");
    if(reason)
        console.error(reason);
}

const logLevels = {
    debug: {
        level: 0,
        logger: console.debug,
        prefix: "DEBUG",
    },
    warn: {
        level: 1,
        logger: console.warn,
        prefix: "WARNING",
    },
    status: {
        level: 2,
        logger: console.info,
        prefix: "INFO",
    },
    error: {
        level: 2,
        logger: console.error,
        prefix: "ERROR",
    },
};

const minLogLevel = (logLevels[(process.env.MWD_LOG_LEVEL || "").toLowerCase()] || logLevels.status).level;

function log(level, mode, target) {
    const type = logLevels[level];
    if(type && type.level >= minLogLevel) {
        const prefix = `[${type.prefix}]`.padStart(9);
        type.logger(`${prefix} ${mode.padStart(18)} - ${target}`);
        return true;
    }
    return false;
}

function logError(err, mode, target) {
    if(log("error", mode, target)) {
        logLevels.error.logger(err);
        return true;
    }
    return false;
}

function downgradeBiomes(biomes) {
    //int array to byte array, 1.13 biomes to 1.12 biomes
    return "[" + biomes.substring(1, biomes.length - 2)
        .split(",")
        .map(x => biomeMapping[x])
        .join(",") + "]b";
}

function splitBits(ints, bitsPerOutput) {
    
    const output = [];
    const bits = [];
    
    for(let i = 0; i < ints.length; i += 2) {
        for(let k = 31; k >= 0; k--)
            bits.push(((ints[i + 1] >> (31 - k)) & 0x1) === 1);
        for(let k = 31; k >= 0; k--)
            bits.push(((ints[i] >> (31 - k)) & 0x1) === 1); //read long backwards
    }
    if(false) {
    let str = "";
    for(let i = 0; i < bits.length; i += 4)
        str +=(i % 128 === 0 ? "\n" : "") + ("0123456789abcdef".charAt(
            (bits[i] ? 1 : 0) + (bits[i + 1] ? 2 : 0) + (bits[i + 2] ? 4 : 0) + (bits[i + 3] ? 8 : 0)
            ))
    console.log(str);
    }
    let index = 0;
    while(index < bits.length) {
        let tmp = 0;
        for(let k = 0; k < bitsPerOutput; k++)
            if(bits[index++])
                tmp += 1 << k;
        output.push(tmp);
    }
    
    return output;
}

function downgradeHeightmap(heightmap) {
    return "[" + splitBits(heightmap.substring(1, heightmap.length - 2)
            .split(/[,;]/).map(x => Number(x)), 9, 0) + "]i";
}

function removePalette(section) {
    const newSection = {
        Y: section.Y,
        BlockLight: section.BlockLight,
        SkyLight: section.SkyLight,
    };
    
    // each long is mapped to two ints by my API because of JavaScript's number limitations
    const ints = section.BlockStates.substring(1, section.BlockStates.length - 2).split(/[,;]/).map(x => Number(x));
    // section.Palette is always going to have at least one entry, so we don't need to do nbtCleaner.listLength
    const bitsPerBlock = section.Palette.length <= 16 ? 4 : Math.floor(Math.log2(section.Palette.length - 0.5) + 1);
    //const extraBits = (bitsPerBlock * 4096) % 64;
    
    const blockStates = splitBits(ints, bitsPerBlock, 0);
    
    const newBlockIds = [];
    const newBlockData = [];
    let blockDataNybbles = [];
    
    for(let i = 0; i < blockStates.length; i++) {
        if(section.Palette[blockStates[i]]) {
            let { Name: name, Properties: props } = section.Palette[blockStates[i]];
            name = JSON.parse(name);
            const block = blockMapping[name];
            if(!block) {
                newBlockIds.push(0);
                blockDataNybbles.push(0);
            }
            else {
                let id = block.id;
                let data = block.data;
                if(block.properties && props) {
                    Object.keys(props).forEach(prop => data += block.properties[prop][JSON.parse(props[prop])]);
                }
                if(id > 128)
                    newBlockIds.push(id - 256);
                else
                    newBlockIds.push(id);
                blockDataNybbles.push(data & 0xF);
                if(data > 0xF || data < 0)
                    console.warn(`Warning: out-of-range block data value ${data} for block "${name}"`);
            }
        }
        else {
            newBlockIds.push(0);
            blockDataNybbles.push(0);
            console.warn(`Warning: out-of-range block palette index ${blockStates[i]} (palette only contains ${section.Palette.length} entries)`);
        }
        if(blockDataNybbles.length == 2) {
            let num = (blockDataNybbles.pop() << 4) + blockDataNybbles.pop(); //reverse order for some reason
            if(num >= 128)
                num -= 256;
            newBlockData.push(num);
        }
    }
    
    newSection.Blocks = "[" + newBlockIds.join(",") + "]b";
    newSection.Data = "[" + newBlockData.join(",") + "]b";
    
    return newSection;
}

function downgradeChunk(oldChunk) {
    const oldLevel = oldChunk.Level;
    const newLevel = {};
    newLevel.xPos = oldLevel.xPos;
    newLevel.zPos = oldLevel.zPos;
    newLevel.InhabitedTime = oldLevel.InhabitedTime;
    newLevel.LastUpdate = oldLevel.LastUpdate;
    newLevel.LightPopulated = "0b";
    newLevel.TerrainPopulated = "1b";
    newLevel.Biomes = downgradeBiomes(oldLevel.Biomes);
    if(nbtCleaner.isListEmpty(oldLevel.Sections))
        newLevel.Sections = oldLevel.Sections;
    else
        newLevel.Sections = oldLevel.Sections.map(removePalette);
    if(oldLevel.Heightmaps && oldLevel.Heightmaps.LIGHT_BLOCKING)
        newLevel.HeightMap = downgradeHeightmap(oldLevel.Heightmaps.LIGHT_BLOCKING);
    else newLevel.HeightMap = "[" + new Array(256).fill(0).join(",") + "]i";
    return {
        Level: newLevel,
        DataVersion: "1343i",
    };
}

async function downgradeAnvil(inputFolder, outputFolder) {
    let files;
    try {
        files = await fs.readdir(inputFolder);
    }
    catch(err) {
        logError(err, "READING FOLDER", inputFolder);
        try {
            await fs.rmdir(outputFolder);
        }
        catch(err) {}
        return;
    }
    for(let i = 0; i < files.length; i++) {
        const inputFile = path.join(inputFolder, files[i]);
        const outputFile = path.join(outputFolder, files[i]);
        let fileMode = "OPENING";
        let file = inputFile;
        let inputRegion, outputRegion;
        try {
            inputRegion = new RegionFile(inputFile);
            await inputRegion.initialize();
            file = outputFile;
            outputRegion = new RegionFile(outputFile);
            await outputRegion.initialize();
            fileMode = "PROCESSING";
            for(let x = 0; x < 32; x++)
                for(let z = 0; z < 32; z++) {
                    let fileMode = "CHECKING";
                    let region = inputFile;
                    try {
                        if(inputRegion.hasChunk(x, z)) {
                            fileMode = "READING";
                            let chunk = await inputRegion.read(x, z);
                            fileMode = "PROCESSING";
                            chunk = downgradeChunk(chunk);
                            region = outputFile;
                            fileMode = "WRITING";
                            await outputRegion.write(x, z, chunk);
                        }
                    }
                    catch(err) {
                        logError(err, fileMode + " CHUNK", region + `/chunk@(${x},${z})`);
                    }
                }
            await inputRegion.close();
            await outputRegion.close();
            log("status", "COMPLETED FILE", inputFile + " -> " + outputFile);
        }
        catch(err) {
            logError(err, fileMode + " FILE", file);
            try {
                if(outputRegion) {
                    await outputRegion.close();
                    await fs.unlink(outputFile);
                }
                if(inputRegion) {
                    await inputRegion.close();
                }
            }
            catch(err) {}
        }
    };
    log("status", "COMPLETED FOLDER", inputFolder + " -> " + outputFolder);
}

(async () => {
    if(process.argv.length < 4) {
        logSyntax();
        return;
    }
    else if(process.argv.length > 4) {
        logSyntax("Note: If your path contains spaces, you must put quotes around it.");
        return;
    }
    const input = process.argv[2];
    try {
        await fs.readdir(input);
    }
    catch(err) {
        logSyntax("Note: The 1.13 world folder must already exist.");
    }
    const output = process.argv[3];
    try {
        await fs.mkdir(output);
        await Promise.all(subfolders.map(subfolder => fs.mkdir(path.join(output, subfolder))));
    }
    catch(err) {
        logSyntax("Note: The 1.12 world folder must not exist yet, and the program must have permission to create it.");
        return;
    }
    try {
        await Promise.all(subfolders.map(async folder =>
            downgradeAnvil(path.join(input, folder), path.join(output, folder))));
        await fs.copyFile(path.join(input, "level.dat"), path.join(output, "level.dat"));
        log("status", "COPIED LEVEL.DAT", input + " -> " + output);
    }
    catch(err) {
        log(err, "COPYING LEVEL.DAT", input + " -> " + output);
        return;
    }
})();