function createSettingsRepository(db) {
  return {
    get(key) {
      const row = db.prepare("SELECT * FROM settings WHERE key = ?").get(key);
      if (!row) {
        return null;
      }

      return {
        key: row.key,
        value: JSON.parse(row.value_json),
        updatedAt: row.updated_at
      };
    },

    set(key, value) {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO settings (key, value_json, updated_at)
        VALUES (:key, :valueJson, :updatedAt)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `).run({
        key,
        valueJson: JSON.stringify(value),
        updatedAt: now
      });

      return this.get(key);
    }
  };
}

module.exports = {
  createSettingsRepository
};
