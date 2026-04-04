/**
 * Database public API: pool, connectToDB, User/Media/Review/Rating models, migrations.
 */
export { connectToDB, pool } from './config/db.js';

export { User } from './models/User.js';
export { Media, isUuid } from './models/Media.js';
export { Review } from './models/Review.js';
export { Rating } from './models/Rating.js';

export { ensureDynamicColumns } from './migrations/dynamicColumns.js';