use crate::library::LibraryId;

use std::{
	collections::{HashMap, HashSet},
	path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::{
	fs::{self, OpenOptions},
	io::{self, AsyncWriteExt},
};
use tracing::error;
use uuid::Uuid;

use super::LocationPubId;

static SPACEDRIVE_LOCATION_METADATA_FILE: &str = ".spacedrive";

#[derive(Serialize, Deserialize, Default, Debug)]
struct LocationMetadata {
	pub_id: LocationPubId,
	name: String,
	path: PathBuf,
	created_at: DateTime<Utc>,
	updated_at: DateTime<Utc>,
}

#[derive(Serialize, Deserialize, Default, Debug)]
struct SpacedriveLocationMetadata {
	libraries: HashMap<LibraryId, LocationMetadata>,
	created_at: DateTime<Utc>,
	updated_at: DateTime<Utc>,
}

pub struct SpacedriveLocationMetadataFile {
	path: PathBuf,
	metadata: SpacedriveLocationMetadata,
}

impl SpacedriveLocationMetadataFile {
	pub async fn try_load(
		location_path: impl AsRef<Path>,
	) -> Result<Option<Self>, LocationMetadataError> {
		let metadata_file_name = location_path
			.as_ref()
			.join(SPACEDRIVE_LOCATION_METADATA_FILE);

		match fs::read(&metadata_file_name).await {
			Ok(data) => Ok(Some(Self {
				metadata: match serde_json::from_slice(&data) {
					Ok(data) => data,
					Err(e) => {
						#[cfg(debug_assertions)]
						{
							error!(
								metadata_file_name = %metadata_file_name.display(),
								?e,
								"Failed to deserialize corrupted metadata file, \
								we will remove it and create a new one;",
							);

							fs::remove_file(&metadata_file_name).await.map_err(|e| {
								LocationMetadataError::Delete(
									e,
									location_path.as_ref().to_path_buf(),
								)
							})?;

							return Ok(None);
						}

						#[cfg(not(debug_assertions))]
						return Err(LocationMetadataError::Deserialize(
							e,
							location_path.as_ref().to_path_buf(),
						));
					}
				},
				path: metadata_file_name,
			})),
			Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
			Err(e) => Err(LocationMetadataError::Read(
				e,
				location_path.as_ref().to_path_buf(),
			)),
		}
	}

	pub async fn create_and_save(
		library_id: LibraryId,
		location_pub_id: Uuid,
		location_path: impl AsRef<Path>,
		location_name: String,
	) -> Result<(), LocationMetadataError> {
		Self {
			path: location_path
				.as_ref()
				.join(SPACEDRIVE_LOCATION_METADATA_FILE),
			metadata: SpacedriveLocationMetadata {
				libraries: [(
					library_id,
					LocationMetadata {
						pub_id: location_pub_id,
						name: location_name,
						path: location_path.as_ref().to_path_buf(),
						created_at: Utc::now(),
						updated_at: Utc::now(),
					},
				)]
				.into_iter()
				.collect(),
				created_at: Utc::now(),
				updated_at: Utc::now(),
			},
		}
		.write_metadata()
		.await
	}

	pub async fn relink(
		&mut self,
		library_id: LibraryId,
		location_path: impl AsRef<Path>,
	) -> Result<(), LocationMetadataError> {
		let location_metadata = self
			.metadata
			.libraries
			.get_mut(&library_id)
			.ok_or(LocationMetadataError::LibraryNotFound(library_id))?;

		let new_path = location_path.as_ref().to_path_buf();
		if location_metadata.path == new_path {
			return Err(LocationMetadataError::RelinkSamePath(new_path));
		}

		location_metadata.path = new_path;
		location_metadata.updated_at = Utc::now();
		self.path = location_path
			.as_ref()
			.join(SPACEDRIVE_LOCATION_METADATA_FILE);

		self.write_metadata().await
	}

	pub async fn update(
		&mut self,
		library_id: LibraryId,
		location_name: String,
	) -> Result<(), LocationMetadataError> {
		let location_metadata = self
			.metadata
			.libraries
			.get_mut(&library_id)
			.ok_or(LocationMetadataError::LibraryNotFound(library_id))?;

		location_metadata.name = location_name;
		location_metadata.updated_at = Utc::now();

		self.write_metadata().await
	}

	pub async fn add_library(
		&mut self,
		library_id: LibraryId,
		location_pub_id: Uuid,
		location_path: impl AsRef<Path>,
		location_name: String,
	) -> Result<(), LocationMetadataError> {
		self.metadata.libraries.insert(
			library_id,
			LocationMetadata {
				pub_id: location_pub_id,
				name: location_name,
				path: location_path.as_ref().to_path_buf(),
				created_at: Utc::now(),
				updated_at: Utc::now(),
			},
		);

		self.metadata.updated_at = Utc::now();
		self.write_metadata().await
	}

	pub fn has_library(&self, library_id: LibraryId) -> bool {
		self.metadata.libraries.contains_key(&library_id)
	}

	pub fn location_path(&self, library_id: LibraryId) -> Option<&Path> {
		self.metadata
			.libraries
			.get(&library_id)
			.map(|l| l.path.as_path())
	}

	pub fn is_empty(&self) -> bool {
		self.metadata.libraries.is_empty()
	}

	pub async fn remove_library(
		&mut self,
		library_id: LibraryId,
	) -> Result<(), LocationMetadataError> {
		self.metadata
			.libraries
			.remove(&library_id)
			.ok_or(LocationMetadataError::LibraryNotFound(library_id))?;

		self.metadata.updated_at = Utc::now();

		if !self.metadata.libraries.is_empty() {
			self.write_metadata().await
		} else {
			fs::remove_file(&self.path)
				.await
				.map_err(|e| LocationMetadataError::Delete(e, self.path.clone()))
		}
	}

	pub async fn clean_stale_libraries(
		&mut self,
		existing_libraries_ids: &HashSet<LibraryId>,
	) -> Result<(), LocationMetadataError> {
		let previous_libraries_count = self.metadata.libraries.len();
		self.metadata
			.libraries
			.retain(|library_id, _| existing_libraries_ids.contains(library_id));

		if self.metadata.libraries.len() != previous_libraries_count {
			self.metadata.updated_at = Utc::now();

			if !self.metadata.libraries.is_empty() {
				self.write_metadata().await
			} else {
				fs::remove_file(&self.path)
					.await
					.map_err(|e| LocationMetadataError::Delete(e, self.path.clone()))
			}
		} else {
			Ok(())
		}
	}

	pub fn location_pub_id(&self, library_id: LibraryId) -> Result<Uuid, LocationMetadataError> {
		self.metadata
			.libraries
			.get(&library_id)
			.ok_or(LocationMetadataError::LibraryNotFound(library_id))
			.map(|m| m.pub_id)
	}

	async fn write_metadata(&self) -> Result<(), LocationMetadataError> {
		let mut file_options = OpenOptions::new();

		// we want to write the file if it exists, otherwise create it
		file_options.create(true).write(true);

		#[cfg(target_os = "windows")]
		{
			use windows::Win32::Storage::FileSystem::FILE_ATTRIBUTE_HIDDEN;
			file_options.attributes(FILE_ATTRIBUTE_HIDDEN.0);
		}

		let metadata_contents = serde_json::to_vec(&self.metadata)
			.map_err(|e| LocationMetadataError::Serialize(e, self.path.clone()))?;

		file_options
			.open(&self.path)
			.await
			.map_err(|e| LocationMetadataError::Write(e, self.path.clone()))?
			.write_all(&metadata_contents)
			.await
			.map_err(|e| LocationMetadataError::Write(e, self.path.clone()))
	}
}

#[derive(Error, Debug)]
pub enum LocationMetadataError {
	#[error("Library not found: {0}")]
	LibraryNotFound(LibraryId),
	#[error("Failed to read location metadata file (path: {1:?}); (error: {0:?})")]
	Read(io::Error, PathBuf),
	#[error("Failed to delete location metadata file (path: {1:?}); (error: {0:?})")]
	Delete(io::Error, PathBuf),
	#[error("Failed to serialize metadata file for location (at path: {1:?}); (error: {0:?})")]
	Serialize(serde_json::Error, PathBuf),
	#[error("Failed to write location metadata file (path: {1:?}); (error: {0:?})")]
	Write(io::Error, PathBuf),
	#[error("Failed to deserialize metadata file for location (at path: {1:?}); (error: {0:?})")]
	Deserialize(serde_json::Error, PathBuf),
	#[error("Failed to relink, as the new location path is the same as the old path: {0}")]
	RelinkSamePath(PathBuf),
}
