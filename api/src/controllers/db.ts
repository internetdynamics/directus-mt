import express from 'express';
// import { InvalidPayloadException } from '../exceptions.js';
// import logger from '../logger.js';
// import {
// 	// createExpressLogger,
// 	useLogger
// } from '../utils/logger.js';
import collectionExists from '../middleware/collection-exists.js';
import { respond } from '../middleware/respond.js';
import { validateBatch } from '../middleware/validate-batch.js';
import { DbService, ItemsService } from '../services/index.js';
// import { PrimaryKey } from '../types';
import asyncHandler from '../utils/async-handler.js';

export interface DataOptions {
	orderBy?:  string[];
	limit?:    number;
	offset?:   number;
	page?:     number;
}

const validParam: any = {
	"columns": true,
};

const router = express.Router();

const getObjectsHandler = asyncHandler(async (req, res, next) => {

	const collection = req.collection;

	const db = new DbService({
		schema: req.schema,
		accountability: req.accountability,
	});

	// TODO: Sanitize the query
	// console.log("XXX /db/%s (controller) query", collection, req.query);
	let columns: string[] = [];

	if (req.query['columns']) {
		const cols = req.query['columns'];
		if (typeof(cols) === "string") columns = cols.split(/,/);
		else if (Array.isArray(cols)) columns = cols as string[];
	}

	const params: any = {};
	const options: DataOptions = {};
	let matches: any;

	for (const queryVar in req.query) {
		const queryVal = req.query[queryVar];

		if (typeof(queryVal) === "string" || typeof(queryVal) === "number")
		if (queryVar === "orderBy") {
			if (typeof(queryVal) === "string") options.orderBy = queryVal.split(/,/);
		}
		else if (queryVar === "limit") {
			options.limit = (typeof(queryVal) === "string") ? parseInt(queryVal, 10) : queryVal;
		}
		else if (queryVar === "offset") {
			options.offset = (typeof(queryVal) === "string") ? parseInt(queryVal, 10) : queryVal;
		}
		else if (queryVar === "page") {
			options.page = (typeof(queryVal) === "string") ? parseInt(queryVal, 10) : queryVal;
		}
		else if ((matches = queryVar.match(/^p-([a-zA-Z_][a-zA-Z0-9_.]*)-?([a-zA-Z]+)$/))) {
			const param: string = matches[1];
			const op: string = matches[2];
			let paramVal: any = queryVal;
			if (op === "in") paramVal = queryVal.split(/,/);
			else if (op === "notIn") paramVal = queryVal.split(/,/);
			else if (op === "null") paramVal = true;
			else if (op === "notNull") paramVal = true;

			if (params[param] === undefined) {
				if (op === "eq") {
					params[param] = paramVal;
				}
				else {
					params[param] = {};
					params[param][op] = paramVal;
				}
			}
			else {
				if (typeof(params[param]) !== "object") {
					params[param] = { eq: params[param] };
				}

				params[param][op] = paramVal;
			}
		}
		else if (validParam[queryVar]) {
			// do nothing
		}
		else {
			throw new Error(`Invalid parameter [${queryVar}]`);
		}
	}

	const objects = await db.getObjects(collection, params, columns, options);

	res.locals['payload'] = {
		data: objects,
	};

	return next();
});

router.search('/:collection', collectionExists, validateBatch('read'), getObjectsHandler, respond);
router.get('/:collection', collectionExists, getObjectsHandler, respond);

router.get(
	'/:collection/:pk',
	collectionExists,
	asyncHandler(async (req, res, next) => {

		const service = new ItemsService(req.collection, {
			accountability: req.accountability,
			schema: req.schema,
		});

		const result = await service.readOne(req.params['pk'] || "0", req.sanitizedQuery);

		res.locals['payload'] = {
			data: result || null,
		};

		return next();
	}),
	respond
);

// router.post(
// 	'/:collection',
// 	collectionExists,
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		if (req.singleton) {
// 			throw new RouteNotFoundException(req.path);
// 		}

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		const savedKeys: PrimaryKey[] = [];

// 		if (Array.isArray(req.body)) {
// 			const keys = await service.createMany(req.body);
// 			savedKeys.push(...keys);
// 		} else {
// 			const key = await service.createOne(req.body);
// 			savedKeys.push(key);
// 		}

// 		try {
// 			if (Array.isArray(req.body)) {
// 				const result = await service.readMany(savedKeys, req.sanitizedQuery);
// 				res.locals.payload = { data: result || null };
// 			} else {
// 				const result = await service.readOne(savedKeys[0], req.sanitizedQuery);
// 				res.locals.payload = { data: result || null };
// 			}
// 		} catch (error: any) {
// 			if (error instanceof ForbiddenException) {
// 				return next();
// 			}

// 			throw error;
// 		}

// 		return next();
// 	}),
// 	respond
// );

// router.patch(
// 	'/:collection',
// 	collectionExists,
// 	validateBatch('update'),
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		if (req.singleton === true) {
// 			await service.upsertSingleton(req.body);
// 			const item = await service.readSingleton(req.sanitizedQuery);

// 			res.locals.payload = { data: item || null };
// 			return next();
// 		}

// 		let keys: PrimaryKey[] = [];

// 		if (Array.isArray(req.body)) {
// 			keys = await service.updateBatch(req.body);
// 		} else if (req.body.keys) {
// 			keys = await service.updateMany(req.body.keys, req.body.data);
// 		} else {
// 			keys = await service.updateByQuery(req.body.query, req.body.data);
// 		}

// 		try {
// 			const result = await service.readMany(keys, req.sanitizedQuery);
// 			res.locals.payload = { data: result };
// 		} catch (error: any) {
// 			if (error instanceof ForbiddenException) {
// 				return next();
// 			}

// 			throw error;
// 		}

// 		return next();
// 	}),
// 	respond
// );

// router.patch(
// 	'/:collection/:pk',
// 	collectionExists,
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		if (req.singleton) {
// 			throw new RouteNotFoundException(req.path);
// 		}

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		const updatedPrimaryKey = await service.updateOne(req.params.pk, req.body);

// 		try {
// 			const result = await service.readOne(updatedPrimaryKey, req.sanitizedQuery);
// 			res.locals.payload = { data: result || null };
// 		} catch (error: any) {
// 			if (error instanceof ForbiddenException) {
// 				return next();
// 			}

// 			throw error;
// 		}

// 		return next();
// 	}),
// 	respond
// );

// router.delete(
// 	'/:collection',
// 	collectionExists,
// 	validateBatch('delete'),
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		if (Array.isArray(req.body)) {
// 			await service.deleteMany(req.body);
// 		} else if (req.body.keys) {
// 			await service.deleteMany(req.body.keys);
// 		} else {
// 			await service.deleteByQuery(req.body.query);
// 		}

// 		return next();
// 	}),
// 	respond
// );

// router.delete(
// 	'/:collection/:pk',
// 	collectionExists,
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		await service.deleteOne(req.params.pk);
// 		return next();
// 	}),
// 	respond
// );

export default router;
