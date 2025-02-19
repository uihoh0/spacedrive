import { ReactComponent as Ellipsis } from '@sd/assets/svgs/ellipsis.svg';
import { Button, tw } from '@sd/ui';

export const SubtleButton = (props: { icon?: React.FC }) => {
	const Icon = props.icon ?? Ellipsis;

	return (
		<Button className="!p-[5px]" variant="subtle">
			{/* @ts-expect-error */}
			<Icon weight="bold" className="size-3" />
		</Button>
	);
};

export const SubtleButtonContainer = tw.div`opacity-0 text-ink-faint group-hover:opacity-30 hover:!opacity-100`;
