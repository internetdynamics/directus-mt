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
// import { getUserAuth } from '../utils/get-user-auth.js';
import { UsersService } from '../services/users.js';
// import logger from '../../../logger';

const router = express.Router();

const readMyGroups = asyncHandler(async (req, res, next) => {
	// console.log("XXX [controllers] groups req", req);
	const accountability = req.accountability;
	// const schema = req.schema;
	// const collection = "group";
	const userId = accountability?.user;
	// const role = accountability?.role;
	const isAdmin = accountability?.admin;
	// console.log("XXX [controllers/groups] readMyGroups : user, role, admin", userId, role, isAdmin);

	// Create an instance of UsersService for full user details
	const usersService = new UsersService({
		schema: req.schema, // Database schema context
		accountability: accountability, // Pass accountability for permissions
	});

	// Fetch full user details
	let user: any;
	// let user = userId ? await getUserAuth(userId) : {};
	// console.log("XXX user", user);

	const database = getDatabase();
	let groups: any[] = [];

	if (userId) {
		user = await usersService.readOne(userId, {
			fields: ['id', 'first_name', 'last_name', 'email', 'role', 'last_access', 'status'],
		});

		if (user) {
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
	// console.log("XXX [controllers/groups] readMyGroups : groups", groups);

	res.locals['payload'] = {
		data: groups,
		// debug: { user: userId, role: role, admin: isAdmin }
	};

	return next();
});

// router.search('/:collection', collectionExists, validateBatch('read'), readMyGroups, respond);
router.get('/', readMyGroups, respond);
// router.get('/myGroups', readMyGroups, respond);
// router.get('/myGroups/:key', readMyGroups, respond);

// /switchGroup/:gid
// Switch to a different group
// This endpoint allows a user to switch to a different group they are a member of.
// It updates the user's currentGroupId and currentGroupRoleId in the directus_users table.
// It also creates a group_memb record if it doesn't exist for the user in that group.
// It returns the updated user information and the list of groups the user is a member of.
router.post(
	'/switchGroup/:gid',

	asyncHandler(async (req, res, next) => {
		// console.log("[controllers] groups/switchGroup/%s", req.params.gid);
		const accountability = req.accountability;
		const userId = accountability?.user;
		// const role = accountability?.role;
		const isAdmin = accountability?.admin;
		const gid: any = req?.params['gid'] ? parseInt(req.params['gid'], 10) : 0;
		// const gidStr = "" + gid;
		// console.log("XXX 1 gid %s [%s] : gidStr %s [%s]", typeof(gid), gid, typeof(gidStr), gidStr);

		const returnPayload: any = {
			success: true,
			message: null,
		};

		let userAuth: any;

		if (userId) {
			const now = new Date();
			const database = getDatabase();

			userAuth = await database
				.select(
					'user.email', 'user.sysRoleId',
					'group.groupname', 'group.groupDisplayName', 'group.isPublic',
					'group_memb.uid', 'group_memb.gid', 'group_memb.groupRoleId',
					'group_memb.lastAccessedDate',
					'group_memb.requestedGroupRoleId', 'group_memb.invitedGroupRoleId',
					'group_memb.user_created', 'group_memb.user_updated',
					'group_memb.date_created', 'group_memb.date_updated',
				)
				.from('directus_users as user')
				.leftJoin(database.raw('`group` on group.id = ?', gid))
				.leftJoin(database.raw('group_memb on group_memb.gid = ? and group_memb.uid = user.id', gid))
				.where({
					'user.id': userId,
				})
				.first();

			returnPayload.userAuth = userAuth;

			if (userAuth) {  // a user was found, but not necessarily a group_memb
				// if the group_memb is missing, should it be created?
				let groupRoleId = userAuth.groupRoleId || 10;

				// if no group was found, return an error
				if (!userAuth.groupname) {
					returnPayload.success = false;
					returnPayload.message = "This group does not exist.";
				}
				// if a group_memb was found, update the lastAccessedDate
				else if (userAuth.gid) {
					const groupMembUpdateValues: any = {
						'lastAccessedDate': now,
					};

					const groupMembUpdateResult = await database('group_memb')
					.where({
						'uid': userId,
						'gid': gid,
					})
					.update({
						'lastAccessedDate': now,
					});
					// console.log("XXX update group_memb result", groupMembUpdateResult);

					returnPayload.groupMembUpdateValues = groupMembUpdateValues;
					returnPayload.groupMembUpdateResult = groupMembUpdateResult;
				}
				// if no group_memb was found and certain conditions apply, then create it
				else if (!userAuth.gid) {
					const groupMemb = {
						'user_created': userId,
						'date_created': now,
						'user_updated': userId,
						'date_updated': now,
						'uid': userId,
						'gid': gid,
						'groupRoleId': 0,
						'lastAccessedDate': now,
					};

					if (isAdmin || userAuth.sysRoleId === 1) {
						groupMemb.groupRoleId = 1;  // superuser
						groupRoleId = 1;
					}
					else if (userAuth.user_created === userId) {
						groupMemb.groupRoleId = 2;  // owner
						groupRoleId = 2;
					}
					else if (userAuth.isPublic) {
						groupMemb.groupRoleId = 9;  // follower
						groupRoleId = 9;
					}

					if (groupMemb.groupRoleId) {
						const groupMembInsertResult = await database('group_memb')
						.insert(groupMemb, ["id"]);

						returnPayload.groupMembInsertValues = groupMemb;
						returnPayload.groupMembInsertResult = groupMembInsertResult;
					}
					else {
						returnPayload.success = false;
						returnPayload.message = "You do not have permission to join switch to this group.";
					}
				}
				// console.log("XXX 2 groupRoleId %s [%s] :  gid %s [%s] : gidStr %s [%s]", typeof(groupRoleId), groupRoleId, typeof(gid), gid, typeof(gidStr), gidStr);

				if (returnPayload.success === true) {
					const userUpdateValues: any = {
						currentGroupId: gid,
						currentGroupRoleId: userAuth.groupRoleId,
						currentGroupId1: groupRoleId <= 1 ? gid : 0,
						currentGroupId2: groupRoleId <= 2 ? gid : 0,
						currentGroupId3: groupRoleId <= 3 ? gid : 0,
						currentGroupId4: groupRoleId <= 4 ? gid : 0,
						currentGroupId5: groupRoleId <= 5 ? gid : 0,
						currentGroupId6: groupRoleId <= 6 ? gid : 0,
						currentGroupId7: groupRoleId <= 7 ? gid : 0,
						currentGroupId8: groupRoleId <= 8 ? gid : 0,
						currentGroupId9: groupRoleId <= 9 ? gid : 0,
						currentGroupId10: groupRoleId <= 10 ? gid : 0,
					};

					const result = await database('directus_users')
					.update(userUpdateValues)
					.where('id', '=', userId);

					returnPayload.userUpdateKey = userId;
					returnPayload.userUpdateValues = userUpdateValues;
					returnPayload.userUpdateResult = result;
					// console.log("XXX update directus_user result", result);
				}
			}
		}
		else {
			returnPayload.success = false;
			returnPayload.message = "You must be logged in to switch groups.";
		}

		res.locals['payload'] = returnPayload;

		return next();
	}),
	respond
);

export default router;
