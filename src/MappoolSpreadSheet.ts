import * as url from 'url';
import { Mappool, Round, OsuMap, ROUND_TYPES, regex } from './types';
import { GoogleSpreadsheet, GoogleSpreadsheetWorksheet } from 'google-spreadsheet';
import { OAuth2Client } from 'google-spreadsheet';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MappoolSpreadSheet implements Mappool {
	private readonly apiKey?: string;
	private readonly oAuth2Client?: OAuth2Client;
	private readonly serviceAccountCredentials?: { client_email: string; private_key: string };

	public spreadsheet: GoogleSpreadsheet;
	public worksheet?: GoogleSpreadsheetWorksheet;
	public url: string;
	public spreadsheetId: string;
	public worksheetId: string;
	public spreadsheetName: string;
	public worksheetName: string;
	public rounds: Round[];

	constructor(
		public options: {
			urlLink: string;
			apiKey?: string;
			oAuth2Client?: OAuth2Client;
			serviceAccountCredentials?: { client_email: string; private_key: string };
		}
	) {
		this.spreadsheetName = '';
		this.worksheetName = '';
		this.rounds = [];
		this.apiKey = options.apiKey;
		this.oAuth2Client = options.oAuth2Client;
		this.serviceAccountCredentials = options.serviceAccountCredentials;
		this.url = options.urlLink;

		const link = url.parse(this.url);
		if (!link || link.host !== 'docs.google.com' || link.protocol === null || link.hash === null) {
			throw new Error('Wrong link');
		}
		const path = link.pathname?.split('/');
		if (!path) throw new Error('Cannot resolve Path Name');
		const params = new URLSearchParams(link.hash.slice(1));

		if (path[1] !== 'spreadsheets') {
			throw new Error('Wrong Link');
		} else if (!params?.has('gid')) {
			throw new Error('Cannot find worksheet id');
		}

		this.spreadsheetId = path[3];
		this.worksheetId = params.get('gid') || '';

		this.spreadsheet = new GoogleSpreadsheet(this.spreadsheetId);
	}

	async authenticate(maxTries = 5, _try = 0) {
		try {
			if (this.serviceAccountCredentials)
				await this.spreadsheet.useServiceAccountAuth(this.serviceAccountCredentials);
			else if (this.apiKey) await this.spreadsheet.useApiKey(this.apiKey);
			else if (this.oAuth2Client) await this.spreadsheet.useOAuth2Client(this.oAuth2Client);
			else throw new Error('No authentication method specified!');
		} catch (e: any) {
			if (e.errno === -4077 && maxTries > _try) {
				await sleep(1000);
				await this.authenticate(maxTries, _try++);
			} else {
				throw new Error(e);
			}
		}
	}

	async loadInfo(maxTries = 5, _try = 0) {
		try {
			if (!this.worksheet) {
				await this.spreadsheet.loadInfo();
				this.spreadsheetName = this.spreadsheet.title;
				this.worksheet = this.spreadsheet.sheetsById[this.worksheetId];
				if (!this.worksheet) throw new Error('Cannot find worksheet by its id');
				this.worksheetName = this.worksheet.title;
			}
			await this.worksheet.loadCells();
		} catch (e: any) {
			if (e.errno === -4077 && maxTries > _try) {
				await sleep(1000);
				await this.loadInfo(maxTries, _try++);
			} else {
				throw new Error(e);
			}
		}
	}

	// Protection from "Comments" section I found here
	// https://docs.google.com/spreadsheets/d/1F9C8jV9G_NOFnfMUJsY5eMJW2FSiUFHvUF-Vr2aYD5k/edit#gid=602149851
	// it also good if their mod name that doesn't belong to a row with a map
	normalizePoolArray(pool: OsuMap[]) {
		const columnCount = new Map();
		for (const map of pool) {
			if (!columnCount.has(map.cords![1])) columnCount.set(map.cords![1], 0);
			columnCount.set(map.cords![1], columnCount.get(map.cords![1]) + 1);
		}
		if (columnCount.size !== 1) {
			const highestValue = Array.from(columnCount.entries()).reduce((p, c) => (c[1] > p[1] ? c : p));
			pool = pool.filter((v) => v.cords![1] === highestValue[0]);
		}

		let previousMod: string;
		let modNum = 1;

		return pool.map((value) => {
			if (previousMod !== value.mod) modNum = 1;
			previousMod = value.mod;
			value.modNum = modNum;
			modNum++;
			return value;
		});
	}

	async parse(): Promise<Mappool> {
		await this.authenticate();
		await this.loadInfo();
		if (this.spreadsheet === undefined || this.worksheet === undefined) throw new Error('Something gone wrong');

		let rounds: Round[] = [];

		const roundsMap: Map<string, Round> = new Map();
		const pools: OsuMap[][] = [];
		const MAX_ROWS: number = this.worksheet.gridProperties.rowCount || 0;
		const MAX_COLUMNS: number = this.worksheet.gridProperties.columnCount || 0;

		for (let i = 0; i < MAX_ROWS; i++) {
			for (let j = 0; j < MAX_COLUMNS; j++) {
				const cell = this.worksheet.getCell(i, j);
				if (cell.value && cell.valueType === 'stringValue') {
					for (const reg of Object.keys(regex.roundNames)) {
						const roundNamesRegex = new RegExp(regex.roundNames[reg]).exec((cell.value as string).trim());
						if (roundNamesRegex) {
							let roundType = reg;
							let roundName = ROUND_TYPES[reg];
							if (reg === 'ro' && roundNamesRegex.groups?.round) {
								roundType = roundType + roundNamesRegex.groups.round;
								roundName = roundName + ' ' + roundNamesRegex.groups.round;
							}
							if (!roundsMap.has(roundType))
								roundsMap.set(roundType, { type: roundType, name: roundName, cords: [i, j], pool: [] });
						}
					}
				}
			}
		}

		rounds = Array.from(roundsMap.values());

		let startMod = '';
		let previousMod = '';
		let currentMod = '';
		let poolsIndex = 0;
		let modNum = 1;

		for (let i = 0; i < MAX_ROWS && (rounds.length === 0 || poolsIndex < rounds.length); i++) {
			for (let j = 0; j < MAX_COLUMNS; j++) {
				const cell = this.worksheet.getCell(i, j);
				if (cell.value && cell.valueType === 'stringValue') {
					const cellValue = (cell.value as string).trim();
					const modRegex = new RegExp(regex.mods).exec(cellValue);
					if (modRegex) {
						if (!modRegex.groups) continue;
						if (previousMod !== modRegex.groups.mod) modNum = 1;
						const mod = modRegex.groups.mod.toLowerCase();

						previousMod = modRegex.groups?.mod || '';
						currentMod = mod + modNum;
						modNum++;

						if (startMod === currentMod) poolsIndex++;
						if (!startMod) startMod = currentMod;
						if (!pools[poolsIndex]) pools[poolsIndex] = [];
						pools[poolsIndex].push({ mod, cords: [i, j] });
					}
				}
			}
		}
		if (pools.length === 0) throw new Error('No pools found');
		for (const pool of pools) {
			const firstMap = pool[0];
			for (let j = 0; j < MAX_COLUMNS; j++) {
				const cell = this.worksheet.getCell((firstMap.cords as any)[0], j);
				if (cell.value && cell.valueType === 'numberValue' && cell.numberFormat?.type !== 'TIME') {
					const numArr: number[] = [];
					pool.forEach((m) => {
						numArr.push(this.worksheet?.getCell((m.cords as any)[0], j).value as number);
					});
					if (Math.round(numArr.reduce((p, a) => p + a, 0) / numArr.length) > 1000) {
						pool.forEach((value, index) => {
							value.id = numArr[index];
						});
					}
				}
			}
		}
		for (const index in pools) pools[index] = this.normalizePoolArray(pools[index]);
		rounds.reverse();
		pools.reverse();

		if (rounds.length === 0) {
			// In this case we will just assign name with BeatmapID so users still could find right pool
			pools.forEach((pool) => {
				rounds.push({
					type: 'u',
					name: `${ROUND_TYPES['u']} (First Beatmap ID: ${pool[0].id})`,
					pool: pool,
					cords: pool[0].cords,
				});
			});
		} else if (rounds.length === pools.length) {
			rounds.forEach((value, index) => {
				value.pool = pools[index];
			});
		} else {
			rounds.forEach((round) => {
				let closest: { pool: OsuMap[]; distance: number | null } = { pool: [], distance: null };
				pools.forEach((pool) => {
					const avg = Math.round(pool.reduce((p, a) => p + a.cords![0], 0) / pool.length),
						distance = (round.cords![0] - avg) ** 2 + (round.cords![1] - pool[0].cords![1]) ** 0.5;
					if (closest.distance === null || distance < closest.distance) {
						closest = { pool, distance };
					}
				});
				round.pool = closest.pool;
			});
		}
		this.rounds = rounds;
		return this.toJSON();
	}
	toJSON(): Mappool {
		const rounds = this.rounds;
		rounds.forEach((round) => {
			delete round.cords;
			round.pool.forEach((map) => delete map.cords);
		});
		return {
			spreadsheetId: this.spreadsheetId,
			spreadsheetName: this.spreadsheetName,
			worksheetId: this.worksheetId,
			worksheetName: this.worksheetName,
			rounds: this.rounds,
		};
	}
}
