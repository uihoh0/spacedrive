import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ExplorerItem, getItemFilePath, getItemObject, Tag } from '@sd/client';
import { tw, twStyle } from '~/lib/tailwind';
import { getExplorerStore } from '~/stores/explorerStore';

import FileThumb from './FileThumb';

type FileRowProps = {
	data: ExplorerItem;
	onPress: () => void;
	onLongPress: () => void;
	renameHandler: () => void;
};

const FileRow = ({ data, onLongPress, onPress, renameHandler }: FileRowProps) => {
	const filePath = getItemFilePath(data);
	const object = getItemObject(data);

	const maxTags = 3;
	const tags = useMemo(() => {
		if (!object) return [];
		return 'tags' in object ? object.tags.slice(0, maxTags) : [];
	}, [object]);

	return (
		<>
			<View
				style={twStyle('flex flex-row items-center px-3', {
					height: getExplorerStore().listItemSize
				})}
			>
				<Pressable onPress={onPress} onLongPress={onLongPress}>
					<FileThumb data={data} size={0.5} />
				</Pressable>
				<View
					style={tw`mx-2 flex-1 flex-row items-center justify-between border-b border-white/10 pb-3`}
				>
					<Pressable
						style={twStyle(tags.length === 0 ? 'w-full' : 'max-w-[85%]')}
						onLongPress={renameHandler}
					>
						<Text numberOfLines={1} style={tw`text-left text-sm font-medium text-ink`}>
							{filePath?.name}
							{filePath?.extension && `.${filePath.extension}`}
						</Text>
					</Pressable>
					<View
						style={twStyle(`mr-1 flex-row`, {
							left: tags.length * 6 //for every tag we add 2px to the left,
						})}
					>
						{tags.map(({ tag }: { tag: Tag }, idx: number) => {
							return (
								<View
									key={tag.id}
									style={twStyle(
										`relative h-3.5 w-3.5 rounded-full border-2 border-black`,
										{
											backgroundColor: tag.color!,
											right: idx * 6
										}
									)}
								/>
							);
						})}
					</View>
				</View>
			</View>
		</>
	);
};

export default FileRow;
