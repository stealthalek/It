const db = require('../db/database');
const { notifyUser } = require('../notifications');

async function createAssignmentLetter(assetId, userId, actorId) {
  if (!assetId || !userId) return;
  if (actorId && Number(actorId) === Number(userId)) return;
  const info = await db.run('INSERT INTO asset_assignment_letters (asset_id, user_id) VALUES (?, ?)', [assetId, userId]);
  const asset = await db.get('SELECT name FROM assets WHERE id = ?', [assetId]);
  const letterId = Number(info.lastInsertRowid);
  notifyUser(userId, null, {
    it: `Nuovo asset assegnato: firma la lettera di assegnazione per "${asset.name}"`,
    en: `New asset assigned: sign the assignment letter for "${asset.name}"`,
  }).catch(() => {});
  return letterId;
}

module.exports = { createAssignmentLetter };
