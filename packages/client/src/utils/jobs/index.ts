import { ForwardRefExoticComponent } from 'react';

import { Report } from '../../core';

export * from './context';
export * from './useGroupJobTimeText';
export * from './useJobInfo';
export * from './useJobProgress';

// NOTE: This type is also used on mobile except for the tooltip, Be careful when changing it.

export interface TextItem {
	text?: string;
	tooltip?: string;
	icon?: ForwardRefExoticComponent<any>;
	onClick?: () => void;
}

// first array for lines, second array for items separated by " • ".
export type TextItems = (TextItem | undefined)[][];

export function getTotalTasks(jobs: Report[]) {
	const tasks = { completed: 0, total: 0, timeOfLastFinishedJob: '' };

	jobs?.forEach(({ task_count, status, completed_at, completed_task_count }) => {
		tasks.total += task_count;
		tasks.completed += status === 'Completed' ? task_count : completed_task_count;
		if (status === 'Completed') {
			tasks.timeOfLastFinishedJob = completed_at || '';
		}
	});

	return tasks;
}

export function getJobNiceActionName(action: string, completed: boolean, job?: Report) {
	let name = 'Unknown';
	if (job != null) {
		for (const metadata of job.metadata) {
			if (metadata.type === 'input' && metadata.metadata.type === 'location') {
				name = metadata.metadata.data.name ?? name;
				break;
			}
		}
	}

	switch (action) {
		case 'scan_location':
			return completed ? `Added location "${name}"` : `Adding location "${name}"`;
		case 'scan_location_sub_path':
			return completed ? `Indexed new files "${name}"` : `Adding location "${name}"`;
	}
	return action;
}
