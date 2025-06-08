import express from 'express';
// import { Query } from '@directus/shared/types';
// import { respond } from '../middleware/respond';
// import { Knex } from 'knex';
import getDatabase from '../database/index.js';
import asyncHandler from '../utils/async-handler.js';
// import { getUserAuth } from '../utils/get-user-auth';
// import logger from '../../../logger';

const router = express.Router();

const redirectMedia = asyncHandler(async (req, res, next) => {
	// console.log("XXX [controllers] forwarders req", req);
	const accountability = req.accountability;
	const userId = accountability?.user;
	// const role = accountability?.role;
	// const isAdmin = accountability?.admin;
	// console.log("XXX [controllers/groups] readMyGroups : user, role, admin", userId, role, isAdmin);

	const database = getDatabase();
	// const user = userId ? await getUserAuth(database, userId) : {};
	// console.log("XXX user", user);

	const type = req.params['type'];
	const id = req.params['id'];
	let recs: any[] = [];
	let url: string = "";

	if (type === "media") {
		recs = await database.select("media.mediaUrl").from("media").where({ 'media.id': id });
		if (recs && recs.length === 1) url = recs[0].mediaUrl;
	}

	// console.log("XXX type [%s] id [%s] => url [%s]", type, id, url);

	if (url) {
		await database('media_usage').insert({
			usageDatetime: new Date(),
			itemType: type,
			itemId: id,
			userId: userId,
			itemStartSec: 0,
			itemUsageSec: 0,
		});

		res.redirect(302, url);
	}
	else {
		next();
		// res.json({
		// 	data: req.params,
		// 	url: url,
		// 	debug: { user: userId, role: role, admin: isAdmin }
		// });
	}
});

// async function getUserAuth (database: Knex<any, any[]>, userId: string) {
// 	const userAuth = await database
// 		.select(
// 			'user.email', 'user.sysRoleId',
// 			'group.groupname', 'group.groupDisplayName', 'group.isPublic',
// 			'group_memb.uid', 'group_memb.gid', 'group_memb.groupRoleId',
// 			'group_memb.lastAccessedDate',
// 			'group_memb.requestedGroupRoleId', 'group_memb.invitedGroupRoleId',
// 			'group_memb.user_created', 'group_memb.user_updated',
// 			'group_memb.date_created', 'group_memb.date_updated',
// 		)
// 		.from('directus_users as user')
// 		.leftJoin(database.raw('`group` on group.id = user.currentGroupId'))
// 		.leftJoin(database.raw('group_memb on group_memb.gid = group.id and group_memb.uid = user.id'))
// 		.where({
// 			'user.id': userId,
// 		})
// 		.first();

// 	return(userAuth);
// }

router.get('/:type/:id', redirectMedia);

export default router;
