// import { nextDay } from 'date-fns';
import express from 'express';
// import { Query } from '@directus/shared/types';
// import { uniqueId } from 'lodash';
// import { ForbiddenException, RouteNotFoundException } from '../exceptions';
// import collectionExists from '../middleware/collection-exists';
import { respond } from '../middleware/respond.js';
// import { validateBatch } from '../middleware/validate-batch';
// import type { Knex } from 'knex';
import getDatabase from '../database/index.js';
// import { ItemsService, MetaService } from '../services';
// import { PrimaryKey } from '../types';
import asyncHandler from '../utils/async-handler.js';
// import { getUserAuth } from '../utils/get-user-auth';
// import logger from '../../../logger';

const router = express.Router();

const handleTestRequests = asyncHandler(async (req, res, next) => {
	// console.log("XXX [controllers] groups req", req);
	const accountability = req.accountability;
	// const schema = req.schema;
	// const collection = "group";
	const userId = accountability?.user;
	// const role = accountability?.role;
	const isAdmin = accountability?.admin;
	// console.log("XXX [controllers/groups] handleTestRequests : user, role, admin", userId, role, isAdmin);

	const user: any = {
		id: userId || null,
		isAdmin: isAdmin || false,
		// sysRoleId: accountability?.sysRoleId || null,
		// currentGroupId: accountability?.currentGroupId || null,
		// currentGroupRoleId: accountability?.currentGroupRoleId || null,
	};
	// const user = userId ? await getUserAuth(userId) : {};
	// const user =
	// console.log("XXX user", user);

	const database = getDatabase();
	let groups: any[];

	if (userId && user) {
		const uid = userId;

		if (isAdmin || user.sysRoleId === 1) {
			groups = await database
			.select(
				'group.id', 'group.groupname', 'group.groupDisplayName', 'group.user_created',
				'group_memb.groupRoleId', 'group_memb.lastAccessedDate',
			)
			.from('group')
			.leftJoin(database.raw('group_memb on group_memb.gid = group.id and group_memb.uid = ?', uid))
			.orderBy("group_memb.lastAccessedDate", "desc", "group.id");
		}
		else {
			groups = await database
			.select(
				'group.id', 'group.groupname', 'group.groupDisplayName', 'group.user_created',
				'group_memb.groupRoleId', 'group_memb.lastAccessedDate',
			)
			.from('group')
			.leftJoin(database.raw('group_memb on group_memb.gid = group.id and group_memb.uid = ?', uid))
			.where({ 'group.isPublic': true })
			.orWhere({ 'group_memb.uid': userId })
			.orWhere({ 'group.user_created': userId })
			.orderBy("group_memb.lastAccessedDate", "desc", "group.id");
		}
		// console.log("groups", groups);
		// if you happen to see a group you created, but there is no group_memb record, create it automatically

		for (const group of groups) {
			if (userId === group.user_created && !group.groupRoleId) {
				await database('group_memb').insert({
					gid: group.id,
					uid: userId,
					groupRoleId: 2,  // OWNER
					user_created: userId,
					date_created: new Date(),
				});

				group.groupRoleId = 2;  // OWNER
			}
		}
	}
	else {
		groups = await database
		.select('group.id', 'group.groupname', 'group.groupDisplayName')
		.from('group')
		.where({ 'group.isPublic': true })
		.orderBy("group.id");
	}

	for (const group of groups) {
		group.groupLabel = group.groupDisplayName + " (" + group.groupname + ")";
	}
	// console.log("XXX [controllers/groups] handleTestRequests : groups", groups);

	res.locals['payload'] = {
		user: user,
		accountability: accountability,
		// schema: req.schema,
		groups: groups,
		// debug: { user: userId, role: role, admin: isAdmin }
	};

	return next();
});

// router.search('/:collection', collectionExists, validateBatch('read'), handleTestRequests, respond);
router.get('/', handleTestRequests, respond);
// router.get('/myGroups', handleTestRequests, respond);
// router.get('/myGroups/:key', handleTestRequests, respond);
// router.get('/:collection', collectionExists, handleTestRequests, respond);

// router.get(
// 	'/:collection/:pk',
// 	collectionExists,
// 	asyncHandler(async (req, res, next) => {
// 		if (req.params.collection.startsWith('directus_')) throw new ForbiddenException();

// 		const service = new ItemsService(req.collection, {
// 			accountability: req.accountability,
// 			schema: req.schema,
// 		});

// 		const result = await service.readOne(req.params.pk, req.sanitizedQuery);

// 		res.locals.payload = {
// 			data: result || null,
// 		};

// 		return next();
// 	}),
// 	respond
// );

// CONDITIONS TO SWITCH TO A GROUP
// {"isPublic":{"_eq":true}}, (create a "follower" membership)
// {"user_created":{"id":{"_eq":"$CURRENT_USER"}}},
// {"groupMembs":{"uid":{"_eq":"$CURRENT_USER"}}},
// {"parentGroupId":{"_eq":"$CURRENT_USER.currentGroupId"}}, (create a "follower" membership)
// {"id":{"_eq":"$CURRENT_USER.currentGroupId"}}

// router.post(
// 	'/switchGroup/:gid',
// 	// collectionExists,
// 	asyncHandler(async (req, res, next) => {
// 		console.log("[controllers] groups/switchGroup/%s", req.params.gid);
// 		let accountability = req.accountability;
// 		let userId = accountability?.user;
// 		// let role = accountability?.role;
// 		let isAdmin = accountability?.admin;
// 		let gid = parseInt(req.params.gid, 10);
// 		let gidStr = "" + gid;
// 		// console.log("XXX 1 gid %s [%s] : gidStr %s [%s]", typeof(gid), gid, typeof(gidStr), gidStr);

// 		if (userId) {
// 			let now = new Date();
// 			const database = getDatabase();
// 			let userAuth = await getUserAuth(userId, gid);
// 			// console.log("XXX userAuth", userAuth);

// 			if (userAuth) {  // this should always be true as long as the user is correct
// 				// if the group_memb is missing, should it be created?
// 				let groupRoleId = userAuth.groupRoleId || 10;
// 				if (!userAuth.gid) {
// 					const groupMemb = {
// 						'user_created': userId,
// 						'date_created': now,
// 						'user_updated': userId,
// 						'date_updated': now,
// 						'uid': userId,
// 						'gid': gid,
// 						'groupRoleId': 0,
// 						'lastAccessedDate': now,
// 					};
// 					if (isAdmin || userAuth.sysRoleId === 1) {
// 						groupMemb.groupRoleId = 1;  // superuser
// 						groupRoleId = 1;
// 					}
// 					else if (userAuth.user_created === userId) {
// 						groupMemb.groupRoleId = 2;  // owner
// 						groupRoleId = 2;
// 					}
// 					else if (userAuth.isPublic) {
// 						groupMemb.groupRoleId = 9;  // follower
// 						groupRoleId = 9;
// 					}
// 					if (groupMemb.groupRoleId) {
// 						let groupMembInsertResult = await database('group_memb')
// 						.insert(groupMemb, ["id"]);
// 						// console.log("XXX insert group_memb groupMembInsertResult", groupMembInsertResult);
// 						userAuth.gid = gid;
// 						userAuth.groupRoleId = groupMemb.groupRoleId;
// 						groupRoleId = groupMemb.groupRoleId;
// 					}
// 				}
// 				else if (userAuth.gid) {
// 					let groupMembUpdateResult = await database('group_memb')
// 					.where({
// 						'uid': userId,
// 						'gid': gid,
// 					})
// 					.update({
// 						'lastAccessedDate': now,
// 					});
// 					// console.log("XXX update group_memb result", groupMembUpdateResult);
// 				}
// 				// console.log("XXX 2 groupRoleId %s [%s] :  gid %s [%s] : gidStr %s [%s]", typeof(groupRoleId), groupRoleId, typeof(gid), gid, typeof(gidStr), gidStr);
// 				let result = await database('directus_users')
// 				.where('id', '=', userId)
// 				.update({
// 					currentGroupId: gid,
// 					currentGroupRoleId: userAuth.groupRoleId,
// 					currentGroupId1: groupRoleId <= 1 ? gid : 0,
// 					currentGroupId2: groupRoleId <= 2 ? gid : 0,
// 					currentGroupId3: groupRoleId <= 3 ? gid : 0,
// 					currentGroupId4: groupRoleId <= 4 ? gid : 0,
// 					currentGroupId5: groupRoleId <= 5 ? gid : 0,
// 					currentGroupId6: groupRoleId <= 6 ? gid : 0,
// 					currentGroupId7: groupRoleId <= 7 ? gid : 0,
// 					currentGroupId8: groupRoleId <= 8 ? gid : 0,
// 					currentGroupId9: groupRoleId <= 9 ? gid : 0,
// 					currentGroupId10: groupRoleId <= 10 ? gid : 0,
// 				});
// 				console.log("XXX update directus_user result", result);
// 			}
// 		}
// 		return next();
// 	}),
// 	handleTestRequests,
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
