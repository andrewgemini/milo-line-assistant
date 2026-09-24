CREATE TABLE IF NOT EXISTS google_calendar_connections (
  id INT NOT NULL AUTO_INCREMENT,
  lineUserId VARCHAR(128) NOT NULL,
  accessTokenEncrypted TEXT NULL,
  refreshTokenEncrypted TEXT NOT NULL,
  tokenExpiresAt TIMESTAMP NULL,
  scope TEXT NULL,
  calendarId VARCHAR(255) NOT NULL DEFAULT 'primary',
  status ENUM('connected','disconnected','error') NOT NULL DEFAULT 'connected',
  lastError TEXT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY google_calendar_connections_user_unique (lineUserId),
  INDEX google_calendar_connections_status_idx (status, updatedAt)
);

CREATE TABLE IF NOT EXISTS google_calendar_event_links (
  id INT NOT NULL AUTO_INCREMENT,
  calendarEventId INT NOT NULL,
  lineUserId VARCHAR(128) NOT NULL,
  googleEventId VARCHAR(255) NOT NULL,
  googleCalendarId VARCHAR(255) NOT NULL DEFAULT 'primary',
  status ENUM('active','deleted','error') NOT NULL DEFAULT 'active',
  lastError TEXT NULL,
  syncedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY google_calendar_event_links_event_unique (calendarEventId),
  INDEX google_calendar_event_links_user_idx (lineUserId, status, updatedAt)
);
