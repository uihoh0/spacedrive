import * as RNFS from '@dr.pogodin/react-native-fs';
import { forwardRef, useCallback } from 'react';
import { Alert, NativeModules, Platform, Text, View } from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { useLibraryMutation, useLibraryQuery, useRspcLibraryContext } from '@sd/client';
import { Modal, ModalRef } from '~/components/layout/Modal';
import { Button } from '~/components/primitive/Button';
import useForwardedRef from '~/hooks/useForwardedRef';
import { tw } from '~/lib/tailwind';

import { Icon } from '../icons/Icon';
import { toast } from '../primitive/Toast';

const { NativeFunctions } = NativeModules;

interface DirectoryPickerResult {
	path: string;
	bookmarkFile: string;
}

interface DirectoryPickerModule {
	pickDirectory(): Promise<DirectoryPickerResult>;
	resolveBookmark(bookmarkFileName: string): Promise<{ path: string }>;
}

// import * as ML from 'expo-media-library';

// WIP component
const ImportModal = forwardRef<ModalRef, unknown>((_, ref) => {
	const modalRef = useForwardedRef(ref);
	const isAndroid = Platform.OS === 'android';
	const addLocationToLibrary = useLibraryMutation('locations.addLibrary');
	const relinkLocation = useLibraryMutation('locations.relink');
	const rspc = useRspcLibraryContext();

	const createLocation = useLibraryMutation('locations.create', {
		onError: (error, variables) => {
			modalRef.current?.close();
			//custom message handling
			if (error.message.startsWith('location already exists')) {
				return toast.error('This location has already been added');
			} else if (error.message.startsWith('nested location currently')) {
				return toast.error('Nested locations are currently not supported');
			}
			switch (error.message) {
				case 'NEED_RELINK':
					if (!variables.dry_run) relinkLocation.mutate(variables.path);
					toast.info('Please relink the location');
					break;
				case 'ADD_LIBRARY':
					addLocationToLibrary.mutate(variables);
					break;
				default:
					toast.error(error.message);
					throw new Error('Unimplemented custom remote error handling');
			}
		},
		onSuccess: async (data) => {
			// Fetch the location's path using the location number
			const location = await rspc.client.query(['locations.get', data!]);
			const locationPath = location?.path;
			try {
				// These arguments cannot be null due to compatability with Android (React Native throws an error if even the type is nullable)
				await NativeFunctions.saveLocation(locationPath!, data!);
			} catch (error) {
				console.error('Error saving location:', error);
				toast.error('Error saving location bookmark');
				return;
			}
			toast.success('Location added successfully');
		},
		onSettled: () => {
			rspc.queryClient.invalidateQueries({ queryKey: ['locations.list'] });
			modalRef.current?.close();
		}
	});

	const handleFilesButton = useCallback(async () => {
		const response = await DocumentPicker.pickDirectory({
			presentationStyle: 'pageSheet'
		});

		if (!response) return;

		const uri = response.uri;

		try {
			if (Platform.OS === 'android') {
				const response = await DocumentPicker.pickDirectory({
					presentationStyle: 'pageSheet'
				});

				if (!response) return;

				const uri = response.uri;

				// The following code turns this: content://com.android.externalstorage.documents/tree/[filePath] into this: /storage/emulated/0/[directoryName]
				// Example: content://com.android.externalstorage.documents/tree/primary%3ADownload%2Ftest into /storage/emulated/0/Download/test
				const dirName = decodeURIComponent(uri).split('/');
				// Remove all elements before 'tree'
				dirName.splice(0, dirName.indexOf('tree') + 1);
				const parsedDirName = dirName.join('/').split(':')[1];
				const dirPath = RNFS.ExternalStorageDirectoryPath + '/' + parsedDirName;
				//Verify that the directory exists
				const dirExists = await RNFS.exists(dirPath);
				if (!dirExists) {
					console.error('Directory does not exist'); //TODO: Make this a UI error
					return;
				}

				createLocation.mutate({
					path: dirPath,
					dry_run: false,
					indexer_rules_ids: []
				});
			} else {
				// iOS
				createLocation.mutate({
					path: decodeURIComponent(uri.replace('file://', '')),
					dry_run: false,
					indexer_rules_ids: []
				});
			}
		} catch (err) {
			console.error(err);
		}
	}, [createLocation]);

	// Temporary until we decide on the user flow
	const handlePhotosButton = useCallback(async () => {
		Alert.alert('TODO');
		return;

		// // Check if we have full access to the photos library
		// let permission = await ML.getPermissionsAsync();
		// // {"accessPrivileges": "none", "canAskAgain": true, "expires": "never", "granted": false, "status": "undetermined"}

		// if (
		// 	permission.status === ML.PermissionStatus.UNDETERMINED ||
		// 	(permission.status === ML.PermissionStatus.DENIED && permission.canAskAgain)
		// ) {
		// 	permission = await ML.requestPermissionsAsync();
		// }

		// // Permission Denied
		// if (permission.status === ML.PermissionStatus.DENIED) {
		// 	Alert.alert(
		// 		'Permission required',
		// 		'You need to grant access to your photos library to import your photos/videos.'
		// 	);
		// 	return;
		// }

		// // Limited Permission (Can't access path)
		// if (permission.accessPrivileges === 'limited') {
		// 	Alert.alert(
		// 		'Limited access',
		// 		'You need to grant full access to your photos library to import your photos/videos.'
		// 	);
		// 	return;
		// }

		// // If android return error for now...
		// if (Platform.OS !== 'ios') {
		// 	Alert.alert('Not supported', 'Not supported for now...');
		// 	return;
		// }

		// // And for IOS we are assuming every asset is under the same path (which is not the case)

		// // file:///Users/xxxx/Library/Developer/CoreSimulator/Devices/F99C471F-C9F9-458D-8B87-BCC4B46C644C/data/Media/DCIM/100APPLE/IMG_0004.JPG
		// // file:///var/mobile/Media/DCIM/108APPLE/IMG_8332.JPG‘

		// const firstAsset = (await ML.getAssetsAsync({ first: 1 })).assets[0];

		// if (!firstAsset) return;

		// // Gets asset uri: ph://CC95F08C-88C3-4012-9D6D-64A413D254B3
		// const assetId = firstAsset?.id;
		// // Gets Actual Path
		// const path = (await ML.getAssetInfoAsync(assetId)).localUri;

		// const libraryPath = Platform.select({
		// 	android: '',
		// 	ios: path.replace('file://', '').split('Media/DCIM/')[0] + 'Media/DCIM/'
		// });

		// createLocation({
		// 	path: libraryPath,
		// 	indexer_rules_ids: []
		// });

		// const assets = await ML.getAssetsAsync({ mediaType: ML.MediaType.photo });
		// assets.assets.map(async (i) => {
		// 	console.log((await ML.getAssetInfoAsync(i)).localUri);
		// });
	}, []);

	// const testFN = useCallback(async () => {
	// 	console.log(RFS.PicturesDirectoryPath);

	// 	const firstAsset = (await ML.getAssetsAsync({ first: 1 })).assets[0];
	// 	console.log(firstAsset);
	// 	const assetUri = firstAsset.id;
	// 	const assetDetails = await ML.getAssetInfoAsync(assetUri);
	// 	console.log(assetDetails);
	// 	const path = assetDetails.localUri;
	// 	console.log(path.replace('file://', '').split('Media/DCIM/')[0] + 'Media/DCIM/');
	// 	// const URL = decodeURIComponent(RFS.DocumentDirectoryPath + '/libraries');
	// 	RFS.readdir('/storage/emulated/0/Download/').then((files) => {
	// 		files.forEach((file) => {
	// 			console.log(file);
	// 		});
	// 	});
	// }, []);

	return (
		<Modal ref={modalRef} snapPoints={['20']}>
			<View style={tw`flex-1 flex-row justify-evenly gap-2 px-8 pt-6`}>
				{/* <Button variant="accent" style={tw`my-2`} onPress={testFN}>
					<Text>TEST</Text>
				</Button> */}
				<Button
					variant="darkgray"
					style={tw`h-20 w-40 items-center justify-center gap-1`}
					onPress={handleFilesButton}
				>
					<Icon name="Folder" size={36} />
					<Text style={tw`text-sm font-medium text-white`}>Import from Files</Text>
				</Button>
				<Button
					variant="darkgray"
					style={tw`h-20 w-40 items-center justify-center gap-1`}
					onPress={handlePhotosButton}
				>
					<Icon name={isAndroid ? 'AndroidPhotos' : 'ApplePhotos'} size={32} />
					<Text style={tw`text-sm font-medium text-white`}>Import from Photos</Text>
				</Button>
			</View>
		</Modal>
	);
});

export default ImportModal;
