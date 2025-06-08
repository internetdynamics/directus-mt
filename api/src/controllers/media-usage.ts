// import { nextDay } from 'date-fns';
import express from 'express';
// import { Query } from '@directus/shared/types';
// import { uniqueId } from 'lodash';
// import { ForbiddenException, RouteNotFoundException } from '../exceptions';
// import collectionExists from '../middleware/collection-exists';
import { respond } from '../middleware/respond.js';
// import { validateBatch } from '../middleware/validate-batch';
import { Knex } from 'knex';
import getDatabase from '../database/index.js';
// import { ItemsService, MetaService } from '../services';
// import { PrimaryKey } from '../types';
import asyncHandler from '../utils/async-handler.js';
// import { getUserAuth } from '../utils/get-user-auth';
// import { userName } from '../utils/user-name.js';
// import { get } from 'lodash';
// import logger from '../../../logger';

const router = express.Router();

const mediaUsageColumns = {
	id: 'id',
	usageDatetime: 'usageDatetime',
	itemType: 'itemType',
	itemId: 'itemId',
	userIpAddr: 'userIpAddr',
	userId: 'userId',
	redirectId: 'redirectId',
	itemStartSec: 'itemStartSec',
	itemUsageSec: 'itemUsageSec',
	itemUsageComplete: 'itemUsageComplete',
};

// const userMediaColumns = {
// 	id: 'id',   // int(10) UN AI PK
// 	status: 'status',   // varchar(255)
// 	sort: 'sort',   // int(11)
// 	user_created: 'user_created',   // char(36)
// 	date_created: 'date_created',   // timestamp
// 	user_updated: 'user_updated',   // char(36)
// 	date_updated: 'date_updated',   // timestamp
// 	watchlist: 'watchlist',   // tinyint(1)
// 	durationWatched: 'durationWatched',   // time
// 	watched: 'watched',   // tinyint(1)
// 	watchAgain: 'watchAgain',   // tinyint(1)
// 	recommendToOthers: 'recommendToOthers',   // tinyint(1)
// 	rating: 'rating',   // int(11)
// 	comments: 'comments',   // text
// 	mediaId: 'mediaId',   // int(10) UN
// 	userId: 'userId',   // char(36)
// 	mediaScore: 'mediaScore',   // float(10,5)
// 	completedDatetime: 'completedDatetime',   // datetime
// 	durationWatchedSec: 'durationWatchedSec',   // int(11)
// 	isCompleted: 'isCompleted',   // tinyint(1)
// 	lastWatchedDatetime: 'lastWatchedDatetime',   // datetime
// };

function getIpAddr (req: any) {
	let userIpAddr = req.ip;

	if (req.headers['x-forwarded-for']) {
		const x_forwarded_for = req.headers['x-forwarded-for'];

		if (typeof(x_forwarded_for) === "string") {
			// console.log("XXX getIpAddr() : x_forwarded_for (string)", x_forwarded_for);
			userIpAddr = x_forwarded_for.split(/[, ]+/)[0];
		}
		else if (Array.isArray(x_forwarded_for)) {
			// console.log("XXX getIpAddr() : x_forwarded_for (array)", x_forwarded_for);
			userIpAddr = x_forwarded_for[0];
		}
		else {
			// console.log("XXX getIpAddr() : x_forwarded_for (%s)", typeof(x_forwarded_for), x_forwarded_for);
		}
	}

	return(userIpAddr);
}

function getDurationWatchedSec(mediaUsages: any[], result: any = {}, opts: any = {}) {
	const segments: any[] = [];
	const mediaDurationSec = result.media?.mediaDurationSec;
	// console.log("XXX getDurationWatchedSec() : mediaUsages.length", mediaUsages.length);

	for (const mediaUsage of mediaUsages) {
		const itemStartSec = mediaUsage.itemStartSec;
		const itemUsageSec = mediaUsage.itemUsageSec;
		const itemEndSec = itemStartSec + itemUsageSec;
		// console.log("XXX getDurationWatchedSec() : usage [%s, %s]", itemStartSec, itemEndSec);

		for (let i = 0; i < segments.length; i++) {
			const segment = segments[i];
			const segmentStartSec = segment[0];
			const segmentEndSec = segment[1];
			// if the item is before the segment, then it is inserted

			if (itemEndSec < segmentStartSec - 2) {
				segments.splice(i, 0, [itemStartSec, itemEndSec]);
				break;
			}
			// else if the item overlaps the segment, then it is incorporated
			else if (itemStartSec <= segmentEndSec + 2) {
				if (itemStartSec < segmentStartSec) {
					segment[0] = itemStartSec;
				}

				if (itemEndSec > segmentEndSec) {
					segment[1] = itemEndSec;
				}

				break;
			}
			// else	if the item is after the segment and it is the last segment, then it is inserted
			else if (itemStartSec > segmentEndSec + 2 && i === segments.length - 1) {
				if (itemEndSec >= segmentStartSec) {
					segments.push([itemStartSec, itemEndSec]);
				}

				break;
			}
		}

		if (segments.length === 0) {
			segments.push([itemStartSec, itemEndSec]);
		}
		// console.log("XXX getDurationWatchedSec() : segments", segments);
	}

	if (opts.all || opts.debug) result.segments = segments;
	let durationWatchedSec = 0;

	for (let i = segments.length-1; i >= 1; i--) {
		const segment = segments[i];

		for (let j = 0; j <= i-1; j++) {
			if (segments[j][1] + 2 >= segment[0]) {
				segments[j][1] = segment[1];
				segments.splice(i, 1);
				break;
			}
		}

		durationWatchedSec += segment[1] - segment[0];
	}

	if (mediaDurationSec && durationWatchedSec > mediaDurationSec) { durationWatchedSec = mediaDurationSec; }

	const gaps: string[] = [];
	const gapStartTimes: number[] = [];

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];
		durationWatchedSec += segment[1] - segment[0];

		if (i > 0) {
			gaps.push("" + formatDuration(segments[i-1][1]) + "-" + formatDuration(segment[0]));
			gapStartTimes.push(segments[i-1][1]);
		}
	}

	if (mediaDurationSec) {
		if (durationWatchedSec > mediaDurationSec) {
			durationWatchedSec = mediaDurationSec;
		}

		if (segments.length === 0) {
			gaps.push("0:00-" + formatDuration(mediaDurationSec));
			gapStartTimes.push(0);
		}
		else {
			const segment = segments[segments.length-1];

			if (segment[1] < mediaDurationSec - 5) {
				gaps.push(formatDuration(segment[1]) + "-" + formatDuration(mediaDurationSec));
				gapStartTimes.push(segment[1]);
			}
		}
	}

	if (opts.all || opts.gaps) {
		result.gaps = gaps;
		result.gapStartTimes = gapStartTimes;
	}

	return(durationWatchedSec);
}

function formatDuration (duration: number): string {
	// console.log("XXX formatDuration() :  duration", duration);
	let dur = Math.round(duration);
	const sec = dur % 60;
	dur = Math.floor(dur / 60);
	const min = dur % 60;
	const hours = Math.floor(dur / 60);
	const durationStr = (hours ? ("" + hours + ":") : "") + ((min <= 9 && hours) ? "0" : "") + min + ":" + (sec <= 9 ? "0" : "") + sec;
	// console.log("XXX formatDuration() => durationStr", durationStr);
	return(durationStr);
}

function parseDuration(durationStr: string): number {
	let duration = 0;
	const durationParts = durationStr.split(":");

	if (durationParts.length === 2) {
		duration = parseInt(durationParts[0] || "0", 10) * 60 + parseInt(durationParts[1] || "0", 10);
	}
	else if (durationParts.length === 3) {
		duration = parseInt(durationParts[0] || "0", 10) * 60 * 60 + parseInt(durationParts[1] || "0", 10) * 60 + parseInt(durationParts[2] || "0", 10);
	}
	else {
		// console.log("XXX parseDuration() ERROR: badly formatted duration [%s]", durationStr);
	}

	return(duration);
}

async function getMediaInfo (database: Knex<any, any[]>, userId: string, userAuth: any, itemType: string, itemId: number, result: any, opts: any = {}) {
	if (userAuth) {  // this should always be true as long as the user is correct
		if (opts.all || opts.user) {
			result.email = userAuth.email;
			result.gid = userAuth.gid;
		}

		if (itemType === "media") {

			const medias = await database('media').select("*")
			.where({
				id: itemId,
			});

			if (!medias || medias.length === 0) {
				result.success = false;
				result.message = `Media with that id [${itemId}] not found.`;
			}
			else if (medias.length >= 2) {
				result.success = false;
				result.message = `Found multiple media with that id [${itemId}]. Should never happen.`;
			}
			else {
				const media = medias[0];

				if (media.mediaDuration && (media.mediaDurationSec === null || media.mediaDurationSec === undefined)) {
					media.mediaDurationSec = parseDuration(media.mediaDuration);
					if (opts.all || opts.db) { result.mediaUpdate = { mediaDurationSec: media.mediaDurationSec }}
				}

				result.media = media;

				const mediaUsages = await database('media_usage').select(mediaUsageColumns)
				.where({
					userId: userId,
					itemType: itemType,
					itemId: itemId,
				})
				.orderBy([
					{ column: 'usageDatetime', order: 'desc' },
				]);

				if (opts.all || opts.mediaUsages) result.mediaUsages = mediaUsages;

				const userMedias = await database('user_media').select("*")
				.where({
					userId: userId,
					mediaId: itemId,
				});

				if (!userMedias) {
					result.success = false;
					result.message = `User media with that id [${itemId}] not found.`;
				}
				else if (userMedias.length >= 2) {
					result.success = false;
					result.message = `Found multiple user media with that id [${itemId}] and userId [${userId}]. Should never happen.`;
				}
				else {
					const userMedia = userMedias.length ? userMedias[0] : null;
					result.userMedia = userMedia;
					const now = new Date();
					const durationWatchedSec = getDurationWatchedSec(mediaUsages, result, opts);
					const durationWatched = formatDuration(durationWatchedSec);
					let isCompleted = false;

					if (media.mediaDurationSec && durationWatchedSec >= media.mediaDurationSec * 0.9) {
						isCompleted = true;
					}
					// console.log("XXX getMediaInfo() : durationWatchedSec [%s] media.mediaDurationSec [%s]", durationWatchedSec, media.mediaDurationSec);

					if (!userMedia) {
						const userMediaInsert = {
							mediaId: media.id,   // int(10) UN
							userId: userId,   // char(36)

							status: 'published',   // varchar(255)
							sort: 1,   // int(11)
							user_created: userId,   // char(36)
							date_created: now,   // timestamp
							durationWatched: durationWatched,   // time
							durationWatchedSec: durationWatchedSec,   // int(11)
							lastWatchedDatetime: now,   // datetime
							isCompleted: isCompleted,   // tinyint(1)
							completedDatetime: (isCompleted ? now : null),   // datetime

							watchlist: false,   // tinyint(1)
							watched: false,   // tinyint(1)
							watchAgain: false,   // tinyint(1)
							recommendToOthers: false,   // tinyint(1)
							rating: null,   // int(11)
							comments: null,   // text
							mediaScore: 1,   // float(10,5)
						};

						if (opts.all || opts.db) result.userMediaInsert = userMediaInsert;
					}
					else {
						const userMediaUpdate: any = {
							user_updated: userId,   // char(36)
							date_updated: now,   // timestamp
							durationWatched: durationWatched,   // time
							durationWatchedSec: durationWatchedSec,   // int(11)
							lastWatchedDatetime: now,   // datetime
						};

						if (!userMedia.isCompleted && isCompleted) {
							userMediaUpdate.isCompleted = isCompleted;   // tinyint(1)
							userMediaUpdate.completedDatetime = now;   // datetime
						}

						if (opts.all || opts.db) result.userMediaUpdate = userMediaUpdate;
					}
					// TODO

					if (opts.all || opts.db) result.mediaUsageUpdate = {
						usageDatetime: now,
					};
				}
			}
		}
		else {
			result.success = false;
			result.message = `Item type [${itemType}] not supported`;
		}
	}
	else {
		result.success = false;
		result.message = "Not a known user. Not authorized.";
	}
}

async function getUserAuth (database: Knex<any, any[]>, userId: string) {
	const userAuth = await database
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
		.leftJoin(database.raw('`group` on group.id = user.currentGroupId'))
		.leftJoin(database.raw('group_memb on group_memb.gid = group.id and group_memb.uid = user.id'))
		.where({
			'user.id': userId,
		})
		.first();

	return(userAuth);
}

router.get(
	'/:itemType/:itemId',
	asyncHandler(async (req, res, next) => {
		// console.log("[controllers] GET media_usage");
		const userIpAddr = getIpAddr(req);
		const itemType = req.params['itemType'] || "unknown";
		const itemId = parseInt(req.params['itemId'] || "0", 10);
		const accountability = req.accountability;
		const userId = accountability?.user;
		// const role = accountability?.role;
		const isAdmin = accountability?.admin;

		const result: any = {
			success: true,
			itemType: itemType,
			itemId: itemId,
			userIpAddr: userIpAddr,
			userId: userId,
			isAdmin: isAdmin,
			// headers: req.headers,
		};

		if (userId) {
			const database = getDatabase();
			const userAuth = await getUserAuth(database, userId);
			// console.log("XXX userAuth", userAuth);
			// result.userAuth = userAuth;
			// console.log("XXX 1 gid %s [%s] : gidStr %s [%s]", typeof(gid), gid, typeof(gidStr), gidStr);
			await getMediaInfo(database, userId, userAuth, itemType, itemId, result, { all: true });
		}
		else {
			result.success = false;
			result.message = "Not logged in. Not authorized.";
		}

		res.locals['payload'] = result;
		return next();
	}),
	respond
);

router.patch(
	'/:mediaUsageId',
	asyncHandler(async (req, res, next) => {
		const mediaUsageId = parseInt(req.params['mediaUsageId'] || "0", 10);
		// console.log("[controllers] PATCH media_usage/%s (muid)", mediaUsageId);
		const userIpAddr = getIpAddr(req);
		// const itemType: string;
		// const itemId: string;
		const accountability = req.accountability;
		const userId = accountability?.user;
		// const role = accountability?.role;
		const isAdmin = accountability?.admin;

		const result: any = {
			success: true,
			userIpAddr: userIpAddr,
			userId: userId,
			isAdmin: isAdmin,
			// headers: req.headers,
		};

		if (userId) {
			const database = getDatabase();
			const userAuth = await getUserAuth(database, userId);
			const mediaUsages = await database('media_usage').select(mediaUsageColumns).where({id: mediaUsageId});

			if (mediaUsages && mediaUsages.length === 1) {
				const mediaUsage = mediaUsages[0];
				const itemType = mediaUsage.itemType;
				const itemId = mediaUsage.itemId;
				result.itemType = itemType;
				result.itemId = itemId;

				await database('media_usage').update({ itemUsageSec: req.body.itemUsageSec }).where({ id: mediaUsageId });
				await getMediaInfo(database, userId, userAuth, itemType, itemId, result, { db: true, gaps: true, gapStartTimes: true });

				if (result.mediaUpdate) {
					await database('media').update(result.mediaUpdate).where({ id: itemId });
				}

				let isCompleted = false;
				if (result.userMediaUpdate?.isCompleted || result.userMediaInsert?.isCompleted || result.userMedia?.isCompleted) isCompleted = true;

				// console.log("XXX req.body.itemUsageSec", req.body.itemUsageSec);
				// console.log("XXX mediaUsage.mediaUsageUpdate", mediaUsage.mediaUsageUpdate);
				if (result.mediaUsageUpdate && req.body.itemUsageSec) {
					const mediaUsageUpdate = result.mediaUsageUpdate;  // includes usageDatetime = now (not much)
					mediaUsageUpdate.userIpAddr = userIpAddr;
					mediaUsageUpdate.itemUsageComplete = isCompleted;
					// console.log("XXX update media_usage : mediaUsageUpdate", mediaUsageUpdate);
					await database('media_usage').update(mediaUsageUpdate).where({ id: mediaUsageId });
					// console.log("XXX update media_usage : sts", sts);
				}

				if (result.userMediaInsert) {
					const ids = await database('user_media').insert(result.userMediaInsert, ["id"]);

					if (ids && ids.length === 1) {
						result.userMediaInsert.id = ids[0];
					}
				}

				if (result.userMediaUpdate && result.userMedia) {
					await database('user_media').update(result.userMediaUpdate).where({ id: result.userMedia.id });
				}
			}
			else {
				result.success = false;
				result.message = `Media Usage with id [${mediaUsageId}] not found.`;
			}
		}
		else {
			result.success = false;
			result.message = "Not logged in. Not authorized.";
		}

		res.locals['payload'] = result;
		return next();
	}),
	respond
);

export default router;
