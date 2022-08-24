export interface Mappool {
	spreadsheetId: string;
	spreadsheetName: string;
	worksheetId: string;
	worksheetName: string;
	rounds: Round[];
}

export interface Round {
	type: string;
	name: string;
	cords?: [number, number];
	pool: OsuMap[];
}

export interface OsuMap {
	mod: string;
	modNum?: number;
	id?: number;
	cords?: [number, number];
	metadata?: any;
}

export const ROUND_TYPES: { [index: string]: any } = {
	u: 'Unknown',
	q: 'Qualifiers',
	ro: 'Round Of',
	qf: 'Quarter Finals',
	sf: 'Semi Finals',
	f: 'Finals',
	gf: 'Grand Finals',
};

export const regex: { [index: string]: any } = {
	roundNames: {
		q: /^qualifiers|^Q$/gi,
		ro: /^(?:round[ -_]?(?:of[ -_]?)?|RO[ -_]?)(?<round>[0-9]{2,})/gi,
		qf: /^(?:quarter[ -_]?finals|QF)/gi,
		sf: /^(?:semi[ -_]?finals|SF)/gi,
		f: /^finals/gi,
		gf: /^(?:grand[ -_]?finals|GF)/gi,
	},
	mods: /^(?<mod>EZ|FL|NM|HD|HR|DT|NC|FM|SD|PF|TB|DTHR|HRDT)(?<num>[0-9]{0,2})?$/gi,
};
