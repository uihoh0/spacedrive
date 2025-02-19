//! This is a basic wrapper for secret/hidden values
//!
//! It's worth noting that this wrapper does not provide additional security that you can't get manually, it just makes it a LOT easier.
//!
//! It implements zeroize-on-drop, meaning the data is securely erased from memory once it goes out of scope.
//! You may call `drop()` prematurely if you wish to erase it sooner.
//!
//! `Protected` values are also hidden from `fmt::Debug`, and will display `[REDACTED]` instead.
//!
//! The only way to access the data within a `Protected` value is to call `.expose()` - this is to prevent accidental leakage.
//! This also makes any `Protected` value easier to audit, as you are able to quickly view wherever the data is accessed.
//!
//! `Protected` values are not able to be copied within memory, to prevent accidental leakage. They are able to be `cloned` however - but this is always explicit and you will be aware of it.
//!
//! I'd like to give a huge thank you to the authors of the [secrecy crate](https://crates.io/crates/secrecy),
//! as that crate's functionality inspired this implementation.
//!
//! # Examples
//!
//! ```rust
//! use sd_crypto::Protected;
//!
//! let secret_data = "this is classified information".to_string();
//! let protected_data = Protected::new(secret_data);
//!
//! // the only way to access the data within the `Protected` wrapper
//! // is by calling `.expose()`
//! let value = protected_data.expose();
//! ```
//!

use std::{fmt::Debug, mem};

use serde::{Deserialize, Serialize};
use zeroize::{Zeroize, ZeroizeOnDrop};

#[derive(Clone, Zeroize, ZeroizeOnDrop, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Protected<T>(T)
where
	T: Zeroize;

impl<T> Protected<T>
where
	T: Zeroize,
{
	pub const fn new(value: T) -> Self {
		Self(value)
	}

	pub const fn expose(&self) -> &T {
		&self.0
	}

	pub fn zeroize(mut self) {
		self.0.zeroize();
	}
}

impl<T: Zeroize> From<T> for Protected<T> {
	fn from(value: T) -> Self {
		Self(value)
	}
}

impl<T> Protected<T>
where
	T: Zeroize + Default,
{
	pub fn into_inner(mut self) -> T {
		let mut out = Default::default();
		mem::swap(&mut self.0, &mut out);
		out
	}
}

impl<T> Debug for Protected<T>
where
	T: Zeroize,
{
	fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
		f.write_str("[REDACTED]")
	}
}
