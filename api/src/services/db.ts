import type { Accountability, Query, SchemaOverview, Item } from '@directus/types';
import type { AbstractServiceOptions } from '../types/index.js';
// import {
// 	// ForbiddenException,
// 	InvalidPayloadException,
// 	// ServiceUnavailableException,
// 	// UnsupportedMediaTypeException,
// } from '../exceptions.js';
// import { parseJSON, toArray } from '@directus/shared/utils';
// import { queue } from 'async';
// import csv from 'csv-parser';
// import destroyStream from 'destroy';
// import { appendFile, createReadStream } from 'fs-extra';
// import { parse as toXML } from 'js2xmlparser';
// import { Parser as CSVParser, transforms as CSVTransforms } from 'json2csv';
import { Knex } from 'knex';
// import { set, transform } from 'lodash';
// import StreamArray from 'stream-json/streamers/StreamArray';
// import stripBomStream from 'strip-bom-stream';
// import { file as createTmpFile } from 'tmp-promise';
import getDatabase from '../database/index.js';
// import env from '../env';
// import logger from '../logger';
// import { getDateFormatted } from '../utils/get-date-formatted';
// import { FilesService } from './files';
import {
	ItemsService,
	// QueryOptions
} from './items.js';
// import { NotificationsService } from './notifications';

const itemServiceOp: any = {
	"eq":            "_eq",            // Equals (Equal to)
	"ne":            "_neq",           // Doesn't equal (Not equal to)
	"lt":            "_lt",            // Less than (Less than)
	"le":            "_lte",           // Less than or equal to (Less than or equal to)
	"gt":            "_gt",            // Greater than (Greater than)
	"ge":            "_gte",           // Greater than or equal to (Greater than or equal to)
	"in":            "_in",            // Is one of (Matches any of the values)
	"null":          "_null",          // Is null (Is null)
	"contains":      "_contains",      // Contains (Contains the substring)
	"startsWith":    "_starts_with",   // Starts with (Starts with)
	"endsWith":      "_ends_with",     // Ends with (Ends with)
	"between":       "_between",       // Is between (Is between two values (inclusive))
	"empty":         "_empty",         // Is empty (Is empty (null or falsy))
	"notIn":         "_nin",           // Is not one of (Doesn't match any of the values)
	"notNull":       "_nnull",         // Isn't null (Is not null)
	"notContains":   "_ncontains",     // Doesn't contain (Doesn't contain the substring)
	"notStartsWith": "_nstarts_with",  // Doesn't start with (Doesn't start with)
	"notEndsWith":   "_nends_with",    // Doesn't end with (Doesn't end with)
	"notBetween":    "_nbetween",      // Isn't between (Is not between two values (inclusive))
	"notEmpty":      "_nempty",        // Isn't empty (Is not empty (null or falsy))
};

export class DbService {
	knex: Knex;
	schema: SchemaOverview;
	accountability: Accountability | null;

	constructor(options: AbstractServiceOptions) {
		this.knex = options.knex || getDatabase();
		this.schema = options.schema;               // ONLY REQUIRED constructor() PARAMETER
		this.accountability = options.accountability || null;
	}

	async getObjects(collection: string, params: any, columns?: string[], options: any = {}): Promise<Item[]> {
		// console.log("XXX DbService.getObjects()", collection, params, columns, options);

		const itemsService = new ItemsService(collection, {
			knex: this.knex,
			schema: this.schema,
			accountability: this.accountability,
		});

		const query: Query = {};
		let matches;

		if (Array.isArray(columns)) {
			query.fields = columns;
		}

		if (typeof(params) === "number") {
			// letfilter.id = params;
			const opValue: any = {};
			opValue["_eq"] = params;
			query.filter = { "id": opValue };
		}
		else if (typeof(params) === "string") {
			const opValue: any = {};
			opValue["_eq"] = params;
			query.filter = { "id": opValue };
		}
		else if (params && typeof(params) === "object") {
			const filter: any = {};
			let filtered = false;
			const deepFilter: any = {};
			let deepFiltered = false;
			// let col, op, itemOp;
			let value;

			for (const col in params) {
				value = params[col];

				if (typeof(value) === "object") {
					const ops = value;

					for (const op in ops) {
						const itemOp = itemServiceOp[op];

						if (itemOp) {
							if ((matches = col.match(/^([a-zA-Z0-9_.]+)\.([a-zA-Z0-9_]+)$/))) {
								this.setValue(filter, col + "." + itemOp, ops[op]);
								filtered = true;
								this.setValue(deepFilter, matches[1] + "._filter." + matches[2] + "." + itemOp, ops[op]);
								deepFiltered = true;
							}
							else {
								this.setValue(filter, col + "." + itemOp, ops[op]);
								filtered = true;
							}
						}
						else {
							throw new Error(`Unknown op [${op}]`);
						}
					}
				}
				else {
					// console.log("XXX filter, col, value", filter, col, value);
					this.setValue(filter, col + "._eq", value);
					filtered = true;

					if ((matches = col.match(/^([a-zA-Z0-9_.]+)\.([a-zA-Z0-9_]+)$/))) {
						this.setValue(filter, col + "._eq", value);
						filtered = true;
						this.setValue(deepFilter, matches[1] + "._filter." + matches[2] + "._eq", value);
						deepFiltered = true;
					}
					else {
						this.setValue(filter, col + "._eq", value);
						filtered = true;
					}
				}
			}

			if (filtered) {
				query.filter = filter;
			}

			if (deepFiltered) {
				query.deep = deepFilter;
			}
		}

		if (options.limit) {
			query.limit = (typeof(options.limit) === "string") ? parseInt(options.limit, 10) : options.limit;
		}
		else {
			query.limit = -1;
		}

		if (options.offset) {
			query.offset = (typeof(options.offset) === "string") ? parseInt(options.offset, 10) : options.offset;
		}

		if (options.page) {
			query.page = (typeof(options.page) === "string") ? parseInt(options.page, 10) : options.page;
		}

		if (options.orderBy && Array.isArray(options.orderBy)) {
			const sort = [];
			let col;

			for (const colsort of options.orderBy) {
				if ((matches = colsort.match(/^(.+)\.(asc|desc)$/))) {
					col = matches[1];

					if (col.indexOf(".") === -1) {
						if (matches[2] === "desc") sort.push("-" + col);
						else sort.push(col);
					}
				}
				else {
					if (colsort.indexOf(".") === -1) {
						sort.push(colsort);
					}
				}
			}

			if (sort.length > 0) {
				query.sort = sort;
			}
		}

		// console.log("XXX DbService.getObjects() ItemsService.readByQuery(query)", query);
		const objects: Item[] = await itemsService.readByQuery(query);

		return(objects);
	}

	private setValue(ref: any, attrib: string, value: any) {
		if (attrib.indexOf(".") === -1) {
			ref[attrib] = value;
		}
		else {
			let refPart = ref;
			const parts = attrib.split(/\./);
			const lenM1 = parts.length - 1;
			let part;

			for (let i = 0; i < lenM1; i++) {
				part = parts[i] || '';
				if (refPart[part] === undefined) refPart[part] = {};
				refPart = refPart[part];
			}

			refPart[parts[lenM1] || ""] = value;
		}
	}

// 	importJSON(collection: string, stream: NodeJS.ReadableStream): Promise<void> {
// 		const extractJSON = StreamArray.withParser();

// 		return this.knex.transaction((trx) => {
// 			const service = new ItemsService(collection, {
// 				knex: trx,
// 				schema: this.schema,
// 				accountability: this.accountability,
// 			});

// 			const saveQueue = queue(async (value: Record<string, unknown>) => {
// 				return await service.upsertOne(value);
// 			});

// 			return new Promise<void>((resolve, reject) => {
// 				stream.pipe(extractJSON);

// 				extractJSON.on('data', ({ value }: Record<string, any>) => {
// 					saveQueue.push(value);
// 				});

// 				extractJSON.on('error', (err: any) => {
// 					destroyStream(stream);
// 					destroyStream(extractJSON);

// 					reject(new InvalidPayloadException(err.message));
// 				});

// 				saveQueue.error((err) => {
// 					reject(err);
// 				});

// 				extractJSON.on('end', () => {
// 					saveQueue.drain(() => {
// 						return resolve();
// 					});
// 				});
// 			});
// 		});
// 	}

// 	importCSV(collection: string, stream: NodeJS.ReadableStream): Promise<void> {
// 		return this.knex.transaction((trx) => {
// 			const service = new ItemsService(collection, {
// 				knex: trx,
// 				schema: this.schema,
// 				accountability: this.accountability,
// 			});

// 			const saveQueue = queue(async (value: Record<string, unknown>) => {
// 				return await service.upsertOne(value);
// 			});

// 			return new Promise<void>((resolve, reject) => {
// 				stream
// 					.pipe(stripBomStream())
// 					.pipe(csv())
// 					.on('data', (value: Record<string, string>) => {
// 						const obj = transform(value, (result: Record<string, string>, value, key) => {
// 							if (value.length === 0) {
// 								delete result[key];
// 							} else {
// 								try {
// 									const parsedJson = parseJSON(value);
// 									if (typeof parsedJson === 'number') {
// 										set(result, key, value);
// 									} else {
// 										set(result, key, parsedJson);
// 									}
// 								} catch {
// 									set(result, key, value);
// 								}
// 							}
// 						});

// 						saveQueue.push(obj);
// 					})
// 					.on('error', (err: any) => {
// 						destroyStream(stream);
// 						reject(new InvalidPayloadException(err.message));
// 					})
// 					.on('end', () => {
// 						saveQueue.drain(() => {
// 							return resolve();
// 						});
// 					});

// 				saveQueue.error((err) => {
// 					reject(err);
// 				});
// 			});
// 		});
// 	}
// }

// export class ExportService {
// 	knex: Knex;
// 	accountability: Accountability | null;
// 	schema: SchemaOverview;

// 	constructor(options: AbstractServiceOptions) {
// 		this.knex = options.knex || getDatabase();
// 		this.accountability = options.accountability || null;
// 		this.schema = options.schema;
// 	}

// 	/**
// 	 * Export the query results as a named file. Will query in batches, and keep appending a tmp file
// 	 * until all the data is retrieved. Uploads the result as a new file using the regular
// 	 * FilesService upload method.
// 	 */
// 	async exportToFile(
// 		collection: string,
// 		query: Partial<Query>,
// 		format: 'xml' | 'csv' | 'json',
// 		options?: {
// 			file?: Partial<File>;
// 		}
// 	) {
// 		try {
// 			const mimeTypes = {
// 				xml: 'text/xml',
// 				csv: 'text/csv',
// 				json: 'application/json',
// 			};

// 			const database = getDatabase();

// 			const { path, cleanup } = await createTmpFile();

// 			await database.transaction(async (trx) => {
// 				const service = new ItemsService(collection, {
// 					accountability: this.accountability,
// 					schema: this.schema,
// 					knex: trx,
// 				});

// 				const totalCount = await service
// 					.readByQuery({
// 						...query,
// 						aggregate: {
// 							count: ['*'],
// 						},
// 					})
// 					.then((result) => Number(result?.[0]?.count ?? 0));

// 				const count = query.limit ? Math.min(totalCount, query.limit) : totalCount;

// 				const requestedLimit = query.limit ?? -1;
// 				const batchesRequired = Math.ceil(count / env.EXPORT_BATCH_SIZE);

// 				let readCount = 0;

// 				for (let batch = 0; batch < batchesRequired; batch++) {
// 					let limit = env.EXPORT_BATCH_SIZE;

// 					if (requestedLimit > 0 && env.EXPORT_BATCH_SIZE > requestedLimit - readCount) {
// 						limit = requestedLimit - readCount;
// 					}

// 					const result = await service.readByQuery({
// 						...query,
// 						limit,
// 						offset: batch * env.EXPORT_BATCH_SIZE,
// 					});

// 					readCount += result.length;

// 					if (result.length) {
// 						await appendFile(
// 							path,
// 							this.transform(result, format, {
// 								includeHeader: batch === 0,
// 								includeFooter: batch + 1 === batchesRequired,
// 							})
// 						);
// 					}
// 				}
// 			});

// 			const filesService = new FilesService({
// 				accountability: this.accountability,
// 				schema: this.schema,
// 			});

// 			const storage: string = toArray(env.STORAGE_LOCATIONS)[0];

// 			const title = `export-${collection}-${getDateFormatted()}`;
// 			const filename = `${title}.${format}`;

// 			const fileWithDefaults: Partial<File> & { storage: string; filename_download: string } = {
// 				...(options?.file ?? {}),
// 				title: options?.file?.title ?? title,
// 				filename_download: options?.file?.filename_download ?? filename,
// 				storage: options?.file?.storage ?? storage,
// 				type: mimeTypes[format],
// 			};

// 			const savedFile = await filesService.uploadOne(createReadStream(path), fileWithDefaults);

// 			if (this.accountability?.user) {
// 				const notificationsService = new NotificationsService({
// 					accountability: this.accountability,
// 					schema: this.schema,
// 				});

// 				await notificationsService.createOne({
// 					recipient: this.accountability.user,
// 					sender: this.accountability.user,
// 					subject: `Your export of ${collection} is ready`,
// 					collection: `directus_files`,
// 					item: savedFile,
// 				});
// 			}

// 			await cleanup();
// 		} catch (err: any) {
// 			logger.error(err, `Couldn't export ${collection}: ${err.message}`);

// 			if (this.accountability?.user) {
// 				const notificationsService = new NotificationsService({
// 					accountability: this.accountability,
// 					schema: this.schema,
// 				});

// 				await notificationsService.createOne({
// 					recipient: this.accountability.user,
// 					sender: this.accountability.user,
// 					subject: `Your export of ${collection} failed`,
// 					message: `Please contact your system administrator for more information.`,
// 				});
// 			}
// 		}
// 	}

// 	/**
// 	 * Transform a given input object / array to the given type
// 	 */
// 	transform(
// 		input: Record<string, any>[],
// 		format: 'xml' | 'csv' | 'json',
// 		options?: {
// 			includeHeader?: boolean;
// 			includeFooter?: boolean;
// 		}
// 	): string {
// 		if (format === 'json') {
// 			let string = JSON.stringify(input || null, null, '\t');

// 			if (options?.includeHeader === false) string = string.split('\n').slice(1).join('\n');

// 			if (options?.includeFooter === false) {
// 				const lines = string.split('\n');
// 				string = lines.slice(0, lines.length - 1).join('\n');
// 				string += ',\n';
// 			}

// 			return string;
// 		}

// 		if (format === 'xml') {
// 			let string = toXML('data', input);

// 			if (options?.includeHeader === false) string = string.split('\n').slice(2).join('\n');

// 			if (options?.includeFooter === false) {
// 				const lines = string.split('\n');
// 				string = lines.slice(0, lines.length - 1).join('\n');
// 				string += '\n';
// 			}

// 			return string;
// 		}

// 		if (format === 'csv') {
// 			const parser = new CSVParser({
// 				transforms: [CSVTransforms.flatten({ separator: '.' })],
// 				header: options?.includeHeader !== false,
// 			});

// 			let string = parser.parse(input);

// 			if (options?.includeHeader === false) {
// 				string = '\n' + string;
// 			}

// 			return string;
// 		}

// 		throw new ServiceUnavailableException(`Illegal export type used: "${format}"`, { service: 'export' });
// 	}
}
