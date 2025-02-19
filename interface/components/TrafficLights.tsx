import closeIconPath from '@sd/assets/svgs/macos_close.svg';
import fullscreenIconPath from '@sd/assets/svgs/macos_fullscreen.svg';
import minimizeIconPath from '@sd/assets/svgs/macos_minimize.svg';
import clsx from 'clsx';
import { ComponentProps, HTMLAttributes, useEffect, useRef } from 'react';
import { useFocusState } from '~/hooks/useFocusState';

export interface TrafficLightsProps extends ComponentProps<'div'> {
	onClose?: () => void;
	onMinimize?: () => void;
	onFullscreen?: () => void;
}

export function MacTrafficLights(props: TrafficLightsProps) {
	const { onClose, onMinimize, onFullscreen, className } = props;
	const [focused] = useFocusState();

	return (
		<div
			data-tauri-drag-region
			className={clsx('group flex flex-row space-x-[7.5px]', className)}
		>
			<TrafficLight type="close" onClick={onClose} colorful={focused ?? false} />
			<TrafficLight type="minimize" onClick={onMinimize} colorful={focused ?? false} />
			<TrafficLight type="fullscreen" onClick={onFullscreen} colorful={focused ?? false} />
		</div>
	);
}

interface TrafficLightProps {
	type: 'close' | 'minimize' | 'fullscreen';
	colorful: boolean;
	onClick?: HTMLAttributes<HTMLDivElement>['onClick'];
}

function TrafficLight(props: TrafficLightProps) {
	const { onClick = () => undefined, colorful = false, type } = props;
	const iconPath = useRef<string>(closeIconPath);

	useEffect(() => {
		switch (type) {
			case 'close':
				iconPath.current = closeIconPath;
				break;
			case 'minimize':
				iconPath.current = minimizeIconPath;
				break;
			case 'fullscreen':
				iconPath.current = fullscreenIconPath;
				break;
		}
	}, [type]);

	return (
		<div
			onClick={onClick}
			className={clsx(
				'box-content flex size-[12px] items-center justify-center rounded-full border-[0.5px] border-transparent bg-[#CDCED0] dark:bg-[#2B2C2F]',
				{
					'border-red-900 !bg-[#EC6A5E] active:hover:!bg-red-700 dark:active:hover:!bg-red-300':
						type === 'close' && colorful,
					'group-hover:!bg-[#EC6A5E]': type === 'close',
					'border-[#F4BE4F] !bg-[#F4BE4F] active:hover:!bg-yellow-600 dark:active:hover:!bg-yellow-200':
						type === 'minimize' && colorful,
					'group-hover:!bg-[#F4BE4F]': type === 'minimize',
					'border-green-900 !bg-[#61C253] active:hover:!bg-green-700 dark:active:hover:!bg-green-300':
						type === 'fullscreen' && colorful,
					'group-hover:!bg-[#61C253]': type === 'fullscreen'
				}
			)}
		>
			<img
				src={iconPath.current}
				className="pointer-events-none opacity-0 group-hover:opacity-100 group-active:opacity-100"
			/>
		</div>
	);
}
