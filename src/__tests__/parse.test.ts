import { MappoolSpreadSheet } from '../index';
import sheets from './sheets.json';
import credentials from './credentials.json';
test('Parse sheets', async () => {
	const sheet = new MappoolSpreadSheet({ urlLink: sheets[0], serviceAccountCredentials: credentials });
	const i = await sheet.parse();
	console.log(i);
});
