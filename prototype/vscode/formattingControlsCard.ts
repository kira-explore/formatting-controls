/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Raju Dhami. All rights reserved.
 *  Licensed under the MIT License. See the extension repository LICENSE for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	$,
	addDisposableListener,
	EventType,
} from '../../../../base/browser/dom.js';
import { Button } from '../../../../base/browser/ui/button/button.js';
import { SelectBox } from '../../../../base/browser/ui/selectBox/selectBox.js';
import { Checkbox } from '../../../../base/browser/ui/toggle/toggle.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize } from '../../../../nls.js';
import { IContextViewService } from '../../../../platform/contextview/browser/contextView.js';
import { IHoverService } from '../../../../platform/hover/browser/hover.js';
import {
	defaultButtonStyles,
	defaultCheckboxStyles,
	defaultSelectBoxStyles,
} from '../../../../platform/theme/browser/defaultStyles.js';
import type {
	CoreAction,
	CoreOption,
	CoreState,
} from './coreControlsProtocol.js';
import './formattingControls.css';

type UserAction = CoreAction extends infer T
	? T extends CoreAction
		? Omit<T, 'session' | 'revision'>
		: never
	: never;

/** An interactive workbench hover; this is intentionally outside the extension API. */
export class FormattingControlsCard extends Disposable {
	private static nextIdentifier = 0;
	private readonly identifier =
		`kira-formatting-card-${FormattingControlsCard.nextIdentifier++}`;
	readonly element = $('.kira-formatting-card');
	private readonly badge = $('span.kira-formatting-state');
	private readonly file = $('span.kira-formatting-file');
	private readonly workspace = $('span.kira-formatting-workspace');
	private readonly error = $('div.kira-formatting-error');
	private readonly disclosure = $('button.kira-formatting-disclosure');
	private readonly chevron = $('span');
	private readonly triggers = $('div.kira-formatting-triggers');
	private readonly rows: {
		checkbox: Checkbox;
		source: HTMLElement;
		effective: HTMLElement;
	}[] = [];
	private readonly scopeSelect: SelectBox;
	private readonly languageSelect: SelectBox;
	private readonly formatterSelect: SelectBox;
	private readonly pause: Button;
	private readonly pauseDescription = $(
		'span.kira-formatting-pause-description',
	);
	private state: CoreState;
	private collapsed = false;
	private busy = false;
	private optionFingerprint = '';

	constructor(
		initial: CoreState,
		private readonly dispatch: (action: CoreAction) => Promise<CoreState>,
		@IContextViewService contextViewService: IContextViewService,
		@IHoverService private readonly hoverService: IHoverService,
	) {
		super();
		this.state = initial;
		this.element.setAttribute('role', 'region');
		this.element.setAttribute(
			'aria-label',
			localize('formattingControls', 'Formatting Controls'),
		);
		const header = this.element.appendChild($('div.kira-formatting-header'));
		header.appendChild(
			$(
				'span.kira-formatting-title',
				undefined,
				localize('title', 'Formatting Controls'),
			),
		);
		header.appendChild(this.badge);
		this.badge.setAttribute('aria-live', 'polite');
		const context = this.element.appendChild($('div.kira-formatting-context'));
		context.appendChild($('span.kira-formatting-info')).className +=
			` ${ThemeIcon.asClassName(Codicon.info)}`;
		const contextText = context.appendChild($('div'));
		contextText.append(this.file, this.workspace);
		this._register(
			this.hoverService.setupDelayedHover(context, () => ({
				content: this.state.path || localize('noActiveFile', 'No active file'),
			})),
		);
		const destinations = this.element.appendChild(
			$('div.kira-formatting-destinations'),
		);
		this.scopeSelect = this.select(
			destinations,
			localize('writeTo', 'Write to'),
			contextViewService,
			index => {
				const option = this.state.destinations[index];
				if (option) {
					void this.run({ type: 'scope', value: option.id });
				}
			},
		);
		this.languageSelect = this.select(
			destinations,
			localize('language', 'Apply to language'),
			contextViewService,
			index => {
				const option = this.state.languages[index];
				if (option) {
					void this.run({ type: 'language', value: option.id });
				}
			},
		);
		const automatic = this.element.appendChild(
			$('section.kira-formatting-automatic'),
		);
		this.disclosure.setAttribute('type', 'button');
		this.disclosure.appendChild(
			$(
				'span',
				undefined,
				localize('automaticFormatting', 'Automatic formatting'),
			),
		);
		this.disclosure.appendChild(this.chevron);
		automatic.append(this.disclosure, this.triggers);
		this._register(
			addDisposableListener(this.disclosure, EventType.CLICK, () => {
				this.collapsed = !this.collapsed;
				this.renderDisclosure();
			}),
		);
		for (const [index, flag] of initial.flags.entries()) {
			const row = this.triggers.appendChild($('div.kira-formatting-trigger'));
			const label = row.appendChild($('div.kira-formatting-trigger-label'));
			const checkbox = this._register(
				new Checkbox(flag.label, flag.checked, {
					...defaultCheckboxStyles,
					checkboxBackground: 'transparent',
					checkboxBorder: 'var(--vscode-descriptionForeground)',
					checkboxForeground: 'var(--vscode-foreground)',
					size: 20,
				}),
			);
			label.appendChild(checkbox.domNode);
			const text = label.appendChild($('span', undefined, flag.label));
			this._register(
				addDisposableListener(text, EventType.CLICK, () => {
					if (!checkbox.enabled) {
						return;
					}
					checkbox.checked = !checkbox.checked;
					checkbox.focus();
					void this.run({
						type: 'flag',
						key: flag.key,
						value: checkbox.checked,
					});
				}),
			);
			this._register(
				checkbox.onChange(() => {
					void this.run({
						type: 'flag',
						key: flag.key,
						value: checkbox.checked,
					});
				}),
			);
			const effective = row.appendChild($('span.kira-formatting-effective'));
			const source = row.appendChild($('div.kira-formatting-source'));
			source.id = `${this.identifier}-source-${index}`;
			checkbox.domNode.setAttribute('aria-describedby', source.id);
			this._register(
				this.hoverService.setupDelayedHover(source, () => ({
					content: this.state.flags[index].source,
				})),
			);
			this.rows.push({ checkbox, source, effective });
		}
		const formatter = this.element.appendChild(
			$('div.kira-formatting-formatter'),
		);
		this.formatterSelect = this.select(
			formatter,
			localize('defaultFormatter', 'Default formatter'),
			contextViewService,
			index => {
				const option = this.state.formatters[index];
				if (option) {
					void this.run({ type: 'formatter', value: option.id });
				}
			},
		);
		const pauseRow = this.element.appendChild($('div.kira-formatting-pause'));
		this.pause = this._register(
			new Button(pauseRow, {
				...defaultButtonStyles,
				buttonSecondaryBackground: 'transparent',
				buttonSecondaryBorder: 'var(--vscode-widget-border)',
				secondary: true,
			}),
		);
		pauseRow.appendChild(this.pauseDescription);
		this._register(
			this.pause.onDidClick(() => {
				void this.run({ type: 'pause' });
			}),
		);
		this._register(
			this.pause.onDidEscape(() => this.hoverService.hideHover(true)),
		);
		this.error.setAttribute('role', 'alert');
		this.error.hidden = true;
		this.element.appendChild(this.error);
		const footer = this.element.appendChild($('div.kira-formatting-footer'));
		this.link(
			footer,
			localize('openDashboard', 'Open dashboard ↗'),
			'dashboard',
		);
		this.link(footer, localize('settings', 'Settings'), 'settings');
		this.update(initial);
		this.renderDisclosure();
	}

	private select(
		container: HTMLElement,
		label: string,
		contextViewService: IContextViewService,
		select: (index: number) => void,
	): SelectBox {
		const row = container.appendChild($('div.kira-formatting-select-row'));
		row.appendChild($('span', undefined, label));
		const host = row.appendChild($('div.kira-formatting-select-host'));
		const control = this._register(
			new SelectBox(
				[],
				0,
				contextViewService,
				{
					...defaultSelectBoxStyles,
					selectBackground: 'var(--vscode-editorHoverWidget-background)',
					selectBorder: 'var(--vscode-widget-border)',
				},
				{
					ariaLabel: label,
					optionsAsChildren: true,
				},
			),
		);
		control.render(host);
		this._register(control.onDidSelect(event => select(event.index)));
		return control;
	}

	private link(
		container: HTMLElement,
		label: string,
		type: 'dashboard' | 'settings',
	): void {
		const link = container.appendChild(
			$('button.kira-formatting-link', undefined, label),
		);
		link.setAttribute('type', 'button');
		this._register(
			addDisposableListener(link, EventType.CLICK, () => {
				void this.run({ type });
			}),
		);
	}

	private renderDisclosure(): void {
		this.disclosure.setAttribute('aria-expanded', String(!this.collapsed));
		this.chevron.className = ThemeIcon.asClassName(
			this.collapsed ? Codicon.chevronRight : Codicon.chevronDown,
		);
		this.triggers.hidden = this.collapsed;
	}

	update(state: CoreState): void {
		this.state = state;
		this.badge.textContent = state.status;
		this.file.textContent = state.language
			? localize(
					'activeFileLanguage',
					'Active file: {0} · {1}',
					state.file,
					state.language,
				)
			: localize('activeFile', '{0}', state.file);
		this.workspace.textContent = state.workspace
			? state.folder
				? localize(
						'workspaceFolder',
						'Workspace: {0} · Folder: {1}',
						state.workspace,
						state.folder,
					)
				: localize('workspace', 'Workspace: {0}', state.workspace)
			: localize('noWorkspace', 'No workspace open');
		const fingerprint = JSON.stringify([
			state.destinations,
			state.languages,
			state.formatters,
		]);
		if (fingerprint !== this.optionFingerprint) {
			this.optionFingerprint = fingerprint;
			for (const [control, options, selected] of [
				[this.scopeSelect, state.destinations, state.destination],
				[this.languageSelect, state.languages, state.languageRule],
				[this.formatterSelect, state.formatters, state.formatter],
			] as const) {
				control.setOptions(
					options.map(option => ({ text: option.label })),
					this.index(options, selected),
				);
			}
		} else {
			this.scopeSelect.select(
				this.index(state.destinations, state.destination),
			);
			this.languageSelect.select(
				this.index(state.languages, state.languageRule),
			);
			this.formatterSelect.select(
				this.index(state.formatters, state.formatter),
			);
		}
		state.flags.forEach((flag, index) => {
			const row = this.rows[index];
			row.checkbox.checked = flag.checked;
			row.source.textContent = flag.source;
			row.effective.textContent = flag.effective
				? localize('on', 'On')
				: localize('off', 'Off');
		});
		this.pause.label = state.paused
			? localize('resume', 'Resume')
			: localize('pause', 'Pause');
		this.pauseDescription.textContent = state.paused
			? localize(
					'restorePreferences',
					'Restore unchanged formatting preferences',
				)
			: state.canPause
				? localize('pauseDescription', 'Temporarily stop automatic formatting')
				: localize('pauseScope', 'Choose Workspace or Folder to pause');
		this.setEnabled();
	}

	private index(options: CoreOption[], value: string): number {
		return Math.max(
			0,
			options.findIndex(option => option.id === value),
		);
	}

	private setEnabled(): void {
		this.scopeSelect.setEnabled(!this.busy);
		this.languageSelect.setEnabled(!this.busy);
		this.formatterSelect.setEnabled(
			!this.busy && !this.state.formatterDisabled,
		);
		this.pause.enabled = !this.busy && this.state.canPause;
		this.rows.forEach((row, index) => {
			if (this.busy || this.state.flags[index].disabled) {
				row.checkbox.disable();
			} else {
				row.checkbox.enable();
			}
		});
		this.element.setAttribute('aria-busy', String(this.busy));
	}

	private async run(action: UserAction): Promise<void> {
		if (this.busy) {
			return;
		}
		this.busy = true;
		this.error.hidden = true;
		this.setEnabled();
		try {
			this.update(
				await this.dispatch({
					...action,
					session: this.state.session,
					revision: this.state.revision,
				}),
			);
			if (action.type === 'dashboard' || action.type === 'settings') {
				this.hoverService.hideHover(true);
			}
		} catch (error) {
			this.error.textContent =
				error instanceof Error ? error.message : String(error);
			this.error.hidden = false;
			this.update(this.state);
		} finally {
			this.busy = false;
			this.setEnabled();
			if (action.type === 'pause' && this.element.isConnected) {
				this.pause.focus();
			}
		}
	}
}
