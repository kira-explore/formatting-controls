/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Raju Dhami. All rights reserved.
 *  Licensed under the MIT License. See the extension repository LICENSE for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableWindowInterval } from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import {
	Disposable,
	DisposableStore,
	MutableDisposable,
} from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import {
	CommandsRegistry,
	ICommandService,
} from '../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import {
	type IWorkbenchContribution,
	registerWorkbenchContribution2,
	WorkbenchPhase,
} from '../../../common/contributions.js';
import {
	type IStatusbarEntry,
	type IStatusbarEntryAccessor,
	IStatusbarService,
	StatusbarAlignment,
	ToggleTooltipCommand,
} from '../../../services/statusbar/browser/statusbar.js';
import {
	type CoreAction,
	type CoreState,
	coreCommands,
	isCoreState,
} from './coreControlsProtocol.js';
import { FormattingControlsCard } from './formattingControlsCard.js';

/** Opt-in handshake with the development extension; contributes no UI on its own. */
class FormattingControlsPrototype
	extends Disposable
	implements IWorkbenchContribution
{
	static readonly ID = 'workbench.contrib.kiraFormattingControlsPrototype';
	private readonly entry = this._register(
		new MutableDisposable<IStatusbarEntryAccessor>(),
	);
	private readonly cards = new Set<FormattingControlsCard>();
	private state: CoreState | undefined;
	private readonly tooltip: IStatusbarEntry['tooltip'];
	private readonly hoverOptions = { appearance: { showPointer: true } };

	constructor(
		@ICommandService private readonly commandService: ICommandService,
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@IInstantiationService
		private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.tooltip = {
			contentOwnsPadding: true,
			element: token => {
				if (!this.state) {
					throw new Error('Formatting Controls extension is disconnected.');
				}
				const store = new DisposableStore();
				const card = store.add(
					this.instantiationService.createInstance(
						FormattingControlsCard,
						this.state,
						(action: CoreAction) => this.dispatch(action),
					),
				);
				this.cards.add(card);
				store.add({ dispose: () => this.cards.delete(card) });
				store.add(token.onCancellationRequested(() => store.dispose()));
				store.add(
					disposableWindowInterval(
						mainWindow,
						() => {
							if (!card.element.isConnected) {
								store.dispose();
							}
						},
						2000,
					),
				);
				return card.element;
			},
		};
		this._register(
			CommandsRegistry.registerCommand(coreCommands.connect, async () => {
				const state = await this.commandService.executeCommand<CoreState>(
					coreCommands.snapshot,
				);
				this.accept(state, true);
				return true;
			}),
		);
		this._register(
			CommandsRegistry.registerCommand(
				coreCommands.update,
				(_accessor, state: CoreState) => this.accept(state),
			),
		);
		this._register(
			CommandsRegistry.registerCommand(
				coreCommands.disconnect,
				(_accessor, session: string) => {
					if (this.state?.session !== session) {
						return;
					}
					this.entry.clear();
					this.state = undefined;
					for (const card of this.cards) {
						card.dispose();
					}
					this.cards.clear();
				},
			),
		);
	}

	private accept(state: unknown, reconnect = false): CoreState {
		if (!isCoreState(state)) {
			throw new Error('Invalid Formatting Controls bridge state.');
		}
		if (
			!reconnect &&
			this.state &&
			(state.session !== this.state.session ||
				state.revision < this.state.revision)
		) {
			return this.state;
		}
		this.state = state;
		for (const card of this.cards) {
			card.update(state);
		}
		const props: IStatusbarEntry = {
			name: localize('formattingControlsName', 'Formatting Controls'),
			text: localize('formattingStatus', 'Formatting: {0}', state.status),
			ariaLabel: localize(
				'formattingStatusAria',
				'Formatting: {0}. Open formatting controls.',
				state.status,
			),
			tooltip: this.tooltip,
			hoverOptions: this.hoverOptions,
			command: ToggleTooltipCommand,
			showBeak: true,
		};
		if (this.entry.value) {
			this.entry.value.update(props);
		} else {
			this.entry.value = this.statusbarService.addEntry(
				props,
				'kiraFormattingControls.prototype.status',
				StatusbarAlignment.RIGHT,
				100,
			);
		}
		return state;
	}

	private async dispatch(action: CoreAction): Promise<CoreState> {
		try {
			const state = await this.commandService.executeCommand<CoreState>(
				coreCommands.action,
				action,
			);
			return this.accept(state);
		} catch (error) {
			try {
				this.accept(
					await this.commandService.executeCommand<CoreState>(
						coreCommands.snapshot,
					),
				);
			} catch {
				/* Keep the action error visible. */
			}
			throw error;
		}
	}
}

registerWorkbenchContribution2(
	FormattingControlsPrototype.ID,
	FormattingControlsPrototype,
	WorkbenchPhase.BlockRestore,
);
