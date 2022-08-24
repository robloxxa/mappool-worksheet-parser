import { writeFile } from 'fs/promises';
import { MappoolSpreadSheet, parseLink } from '../index';
import sheets from './sheets.json';
import serviceAccountCredentials from './credentials.json'; // Google Service Account credentials file

jest.setTimeout(15000);
describe('Successfully parse array of worksheets', () => {
	for (const sheet of sheets) {
		it(`${sheet} parsed`, async () => {
			const { spreadsheetId, worksheetId } = parseLink(sheet);
			const worksheet = new MappoolSpreadSheet({
				spreadsheetId,
				worksheetId,
				serviceAccountCredentials,
			});
			const auth = jest.spyOn(worksheet, 'authenticate');
			const load = jest.spyOn(worksheet, 'loadInfo');
			const info = await worksheet.parse();
			expect(info).not.toBe(Error);
			expect(auth).toBeCalled();
			expect(load).toBeCalled();
			await writeFile(
				`./src/__tests__/sheets/${info.spreadsheetName.replace(
					/[/\\?%*:|"<>]/g,
					''
				)} (${info.worksheetName.replace(/[/\\?%*:|"<>]/g, '')}).json`,
				JSON.stringify(info, null, 2)
			);
		});
	}
});
