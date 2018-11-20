const zlib = require("zlib");
const fs = require("fs").promises;
const nbt = require("./nbt");
const numerics = ["byte", "short", "int", "long", "float", "double"];
const emptyVal = "emptylist:";

function gunzip(data) {
    return new Promise((resolve, reject) => {
        zlib.gunzip(data, (err, result) => {
            if(err) reject(err);
            else resolve(result);
        })
    });
}

function gzip(data) {
    return new Promise((resolve, reject) => {
        zlib.gzip(data, (err, result) => {
            if(err) reject(err);
            else resolve(result);
        })
    });
}

function parseLong(data) {
    const split = data.split(";");
    return [Number(split[0]), Number(split[1])];
}

function writeLong(data) {
    return data[0] + ";" + data[1];
}

/**
 * Warning, throws errors if data is not valid!
 */
function clean(data) {
    let buffer;
    if (data.name || data.name === "" || data.type == "compound") {
        buffer = {};
        Object.keys(data.value).forEach((key) => buffer[key] = clean(data.value[key]));
    }
    else if (data.type == "list") {
        if (data.value.value.length == 0)
            buffer = [emptyVal + data.value.type];
        else {
            buffer = [];
            data.value.value.forEach((item) =>
                buffer.push(clean({
                    "type": data.value.type,
                    "value": item,
                })));
        }
    }
    else if (data.type == "long")
        buffer = writeLong(data.value) + "l";
    else if (numerics.includes(data.type))
        buffer = data.value.toString() + data.type.substring(0, 1);
    else if (data.type == "string")
        buffer = JSON.stringify(data.value); //does this look right?
    else if(data.type == "longArray")
        buffer = "[" + data.value.map(writeLong).join(",") + "]l";
    else if (data.type == "byteArray" || data.type == "intArray")
        buffer = JSON.stringify(data.value) + data.type.substring(0, 1);
    else
        throw new Error("Invalid NBT data!");

    return buffer;
}

function getNBTType(data) {
    if (Array.isArray(data))
        return "list";
    else {
        let str = data.toString();
        if (str.startsWith("[")) {
            if (str.endsWith("]b"))
                return "byteArray";
            else if (str.endsWith("]i"))
                return "intArray";
            else if (str.endsWith("]l"))
                return "longArray";
            else if (str == "[object Object]")
                return "compound";
            else throw new Error("Invalid NBT type!");
        }
        else if (str.startsWith("\"") && str.endsWith("\""))
            return "string";
        else if (str.startsWith(emptyVal))
            return str.substring(emptyVal.length);
        else {
            const num = numerics.find((item) => str.endsWith(item.substring(0, 1)));
            if(num)
                return num;
            else throw new Error("Invalid NBT type!");
        }
    }
}

/**
 * Warning, throws errors if data is not valid!
 */
function unclean(data, isTopLevel = true) {
    let buffer = {};
    if (isTopLevel) {
        buffer.name = "";
        buffer.value = {};
        Object.keys(data).forEach((key) => buffer.value[key] = unclean(data[key], false));
    }
    else {
        buffer.type = getNBTType(data);
        if (buffer.type == "list") {
            let listType = getNBTType(data[0]);
            buffer.value = {
                "type": listType,
                "value": [],
            };
            if (!isListEmpty(data))
                data.forEach((item) => buffer.value.value.push(unclean(item, false).value));
        }
        else if (buffer.type == "compound") {
            buffer.value = {};
            Object.keys(data).forEach((key) => buffer.value[key] = unclean(data[key], false));
        }
        else if (buffer.type == "string")
            buffer.value = JSON.parse(data);
        else if(buffer.type == "longArray") {
            if(data == "[]l")
                buffer.value = [];
            else
                buffer.value = data.substring(1, data.length - 2).split(",").map(parseLong);
        }
        else if (buffer.type == "byteArray" || buffer.type == "intArray")
            buffer.value = JSON.parse(data.substring(0, data.length - 1));
        else if (buffer.type == "long")
            buffer.value = parseLong(data.substring(0, data.length - 1));
        else if (numerics.includes(buffer.type))
            buffer.value = Number(data.substring(0, data.length - 1));
    }
    return buffer;
}

function decodeUncompressed(data) {
    return clean(nbt.parseUncompressed(data));
}

function encodeUncompressed(data) {
    return nbt.writeUncompressed(unclean(data));
}

async function decode(data) {
    return decodeUncompressed(await gunzip(data));
}

async function encode(data) {
    return gzip(encodeUncompressed(data));
}

async function load(filepath) {
    return decode(await fs.readFile(filepath));
}

async function save(data, filepath) {
    await fs.writeFile(filepath, await encode(data));
}

function isListEmpty(arr) {
    return arr[0].toString().startsWith(emptyVal) && !Array.isArray(arr[0]);
}

function listLength(arr) {
    return isListEmpty(arr) ? 0 : arr.length;
}

function concatLists(a, b) {
    if (isListEmpty(a)) {
        if (isListEmpty(b))
            return [a[0]];
        else
            return b;
    }
    else if (isListEmpty(b))
        return a;
    else return a.concat(b);
}

module.exports = { emptyVal, clean, unclean, decodeUncompressed, encodeUncompressed, decode, encode, load, save, isListEmpty, listLength, concatLists };
