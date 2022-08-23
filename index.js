require('dotenv').config()
const {GoogleSpreadsheet} = require("google-spreadsheet");
const url = require('url')
const regexs = require('./regexs')
const sheets = require('./test/sheets.json')
const {writeFile} = require('fs/promises')

const ROUND_TYPES = {
    "u": "Unknown",
    "q": "Qualifiers",
    "ro": "Round Of",
    "qf": "Quarter Finals",
    "sf": "Semi Finals",
    "f": "Finals",
    "gf": "Grand Finals"
}


async function main() {
    for (let s of sheets) {
        try {
            let mappool = await parseSheet(s)
            mappool.rounds.forEach(r => {
                delete r.cords
                r.pool.forEach(m => {
                    delete m.cords
                })
            })
            await writeFile(`./sheets/${mappool.doc_title} (${mappool.sheet_title}).json`, JSON.stringify(mappool, null, 2))
            console.log(`Finished parsing ${mappool.doc_title} (${mappool.sheet_title}).json`)
        } catch (e) {
            console.error(e)
        }
        break
    }
}

async function parseSheet(urlLink) {
    const {doc_id, sheet_id} = parseLink(urlLink)
    const doc = new GoogleSpreadsheet(doc_id)
    try {
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY,
        });
    } catch (e) {
        throw new Error("Can't load authenticate")
    }

    try {

        await doc.loadInfo()
    } catch (e) {
        throw new Error("Can't load doc")
        // if (e.errno === -4077) {
        //     try {
        //         await doc.useServiceAccountAuth({
        //             client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        //             private_key: process.env.GOOGLE_PRIVATE_KEY,
        //         });
        //         await doc.loadInfo()
        //     } catch (e) {
        //         throw new Error(`Can't load the document`)
        //     }
        // }
        // else {
        //     throw e
        // }
    }

    const sheet = doc.sheetsById[sheet_id]
    try {
        await sheet.loadCells()
    } catch (e) {
        throw new Error("Can't load sheet")
    }


    let mappool = {doc_id, sheet_id, doc_title: doc.title, sheet_title: sheet.title, rounds: []},
        rounds = new Map(),
        pools = [],
        max_rows = sheet.gridProperties.rowCount,
        max_columns = sheet.gridProperties.columnCount

    // Trying to find round names such as "Qualifiers/RO32/etc." so we could name pools properly
    for (let i = 0 ; i < max_rows; i++) {
        for (let j = 0 ; j < max_columns; j++) {
            let cell = sheet.getCell(i,j)
            if (cell.value && cell.valueType === 'stringValue')
                for (let reg of Object.keys(regexs.round_names)) {
                    const round_names_regex = new RegExp(regexs.round_names[reg]).exec(cell.value?.trim())
                    if (round_names_regex) {
                        if (reg === 'ro' && round_names_regex.groups?.round) reg = reg+round_names_regex.groups.round
                        // max_columns = j
                        rounds.set(reg, {round_type: reg, round_name: cell.value.trim(), cords: [i,j], pool: []})
                    }
                }
        }
    }

    // Searching for mod names such as NM1/DT2/etc. and saving their cords to search bmid's later
    // TODO: Find a way to parse names where numbers doesn't present (such as NM/DT/FM)
    let start_mod = null,
        previous_mod = null,
        current_mod = null,
        pools_index = 0,
        mod_num = 1
    for (let i = 0 ; i < max_rows && (rounds.length === 0 || pools_index < rounds.length); i++) {
        for (let j = 0 ; j < max_columns; j++) {
            const cell = sheet.getCell(i,j)
            if (cell.value && cell.valueType === 'stringValue') {
                let cellValue = cell.value.trim(),
                    mod_regex = new RegExp(regexs.mods).exec(cellValue)
                if (mod_regex) {
                    if (previous_mod !== mod_regex.groups.mod) {
                        mod_num = 1
                    }
                    let mod = mod_regex.groups.mod.toLowerCase()
                    previous_mod = mod_regex.groups.mod
                    current_mod = mod+mod_num
                    mod_num++
                    if (start_mod === current_mod) pools_index++
                    if (!start_mod) start_mod = current_mod
                    if (!pools[pools_index]) pools[pools_index] = []
                    pools[pools_index].push({mod: mod, cords: [i,j], id: null})
                }
            }
        }
    }

    if (pools.length === 0) throw new Error("No pools found")

    for (let pool of pools) {
        let firstMap = pool[0]
        for (let j = 0; j < max_columns; j++) {
            let cell = sheet.getCell(firstMap.cords[0], j)
            if (cell.value && cell.valueType === "numberValue" && cell.numberFormat?.type !== 'TIME') {
                let numArr = []
                pool.forEach((m) => {
                    numArr.push(sheet.getCell(m.cords[0],j).value)
                })
                if (Math.round(numArr.reduce((p, a) => p + a, 0)/numArr.length) > 1000) {
                    pool.forEach((value, index) => {
                        value.id = numArr[index]
                    })
                }
            }
        }
    }

    for (let index in pools) pools[index] = checkModColumn(pools[index])
    rounds.reverse()
    pools.reverse()

    if (rounds.length === 0) {
        // In this case we will just assign name with BeatmapID so users still could find right pool
        pools.forEach((pool) => {
            rounds.push({
                round_type: 'u',
                round_name: `${ROUND_TYPES['u']} (First Beatmap ID: ${pool[0].id})`,
                pool: pool,
                cords: pool[0].cords
            })
        })
    }
    else if (rounds.length === pools.length) {
        rounds.forEach((value, index) => {
            value.pool = pools[index]
        })
    } else {
        rounds.forEach(round => {
            let closest = {pool: [], distance: null}
            pools.forEach(pool => {
                let avg = Math.round(pool.reduce((p, a) => p+a.cords[0], 0)/pool.length),
                    distance = ((round.cords[0]-avg)**2+(round.cords[1]-pool[0].cords[1])**0.5)
                if (closest.distance === null || distance < closest.distance) {
                    closest = {pool, distance}
                }
            })
            round.pool = closest.pool
        })
    }
    mappool.rounds = rounds
    return mappool
}

// Protection from "Comments" section I found here
// https://docs.google.com/spreadsheets/d/1F9C8jV9G_NOFnfMUJsY5eMJW2FSiUFHvUF-Vr2aYD5k/edit#gid=602149851
// it also good if something goes wrong
function checkModColumn(pool) {
    let columnCount = new Map()

    for (let map of pool) {
        if (!columnCount.has(map.cords[1])) {
            columnCount.set(map.cords[1], 0)
        }
        columnCount.set(map.cords[1], columnCount.get(map.cords[1])+1)
    }

    if (columnCount.size !== 1) {
        let highestValue = [...columnCount.entries()].reduce((p,c) => c[1] > p[1] ? c : p)
        pool = pool.filter((v) => v.cords[1] === highestValue[0])
    }
    let previous_mod = null,
        mod_num = 1
    return pool.map(value => {
        if (previous_mod !== value.mod) mod_num = 1
        previous_mod = value.mod
        value.mod_num = mod_num
        mod_num++
        return value
    })
}

function parseLink(urlLink) {
    let link = url.parse(urlLink)
    if (link.host !== "docs.google.com" || link.protocol === null || link.hash === null) {
        throw new Error("Wrong link")
    }

    let path = link.pathname.split("/")
    let params = new URLSearchParams(link.hash.slice(1))

    if (path[1] !== 'spreadsheets') {
        throw new Error("Wrong Link")
    }
    else if (!params?.has('gid')) {
        throw new Error("Cannot find sheet id")
    }

    return {
        doc_id: path[3],
        sheet_id: params.get('gid')
    }
}


main()