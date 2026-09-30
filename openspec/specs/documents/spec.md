# documents Specification

## Purpose
Stores company documents in private object storage with folder grouping, company/department/private visibility, version history, and audited downloads.

## Requirements

### Requirement: Upload
The system SHALL accept a single PDF, DOCX, XLSX, JPEG, PNG or WebP file up to `MAX_UPLOAD_MB` (default 20 MB) with optional title, folder (default `General`) and visibility (COMPANY, DEPARTMENT, PRIVATE; default COMPANY), store the body in object storage under a random key, and create version 1.

#### Scenario: Unsupported type
- **WHEN** a user uploads a file with another MIME type
- **THEN** the response is 400 `UNSUPPORTED_FILE_TYPE`

#### Scenario: Employee publishes company-wide
- **WHEN** an EMPLOYEE uploads with visibility COMPANY
- **THEN** the response is 403 `FORBIDDEN`

#### Scenario: Database write fails after storage
- **WHEN** storing metadata fails after the object was written
- **THEN** the stored object is deleted

### Requirement: Department visibility target
The system SHALL require a DIRECTOR to name a department of the company for DEPARTMENT visibility, and SHALL force MANAGERs and EMPLOYEEs to use their own department.

#### Scenario: Manager targets another department
- **WHEN** a MANAGER uploads with DEPARTMENT visibility for another department
- **THEN** the response is 403 `INVALID_DEPARTMENT`

### Requirement: Document visibility
The system SHALL show a DIRECTOR every company document, and SHALL show other users documents that are COMPANY-visible, uploaded by them, or DEPARTMENT-visible for their department.

#### Scenario: Private document of a colleague
- **WHEN** an EMPLOYEE requests another user's PRIVATE document
- **THEN** the response is 404 `DOCUMENT_NOT_FOUND`

### Requirement: Versions
The system SHALL let the uploader, a MANAGER of the document's department, or a DIRECTOR upload a new version, incrementing the version number under a row lock and keeping every prior version in history.

#### Scenario: New version
- **WHEN** an authorized user uploads a new version
- **THEN** the document points at the new file, the version increments, the history lists all versions newest first, and `DOCUMENT_VERSION_UPLOADED` is audited

#### Scenario: Reader tries to version
- **WHEN** a user who can only read the document uploads a version
- **THEN** the response is 403 `FORBIDDEN`

### Requirement: Audited download
The system SHALL stream the current version only after the visibility check, as an attachment with the original file name, and SHALL audit `DOCUMENT_DOWNLOADED`. Storage keys SHALL never appear in API responses.

#### Scenario: Download
- **WHEN** a user with access downloads a document
- **THEN** the file is streamed and a download event with the version is audited
