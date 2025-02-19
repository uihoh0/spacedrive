import clsx from 'clsx';

export default ({ component: Icon, ...props }: any) => (
	<Icon weight="bold" {...props} className={clsx('mr-2 size-4', props.className)} />
);
