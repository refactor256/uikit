import React from 'react';
import _memoize from 'lodash/memoize';

import {block} from '../../../utils/cn';
import {Table, TableDataItem, TableProps, TableColumnConfig} from '../../Table';
import {SortIndicator} from './SortIndicator/SortIndicator';

import './withTableSorting.scss';

type ColumnSortOrder = 'asc' | 'desc';

interface ColumnSortState {
    column: string;
    order: ColumnSortOrder;
}

type SortState = ColumnSortState[];

export type TableSortState = SortState;
export type TableColumnSortState = ColumnSortState;

export interface WithTableSortingProps {
    defaultSortState?: SortState;
    sortState?: SortState;
    onSortStateChange?: (sortState: SortState) => void;
}

interface WithTableSortingState {
    sort: SortState;
}

const b = block('table');

export function withTableSorting<I extends TableDataItem, E extends {} = {}>(
    TableComponent: React.ComponentType<TableProps<I> & E>,
): React.ComponentType<TableProps<I> & WithTableSortingProps & E> {
    const componentName = TableComponent.displayName || TableComponent.name || 'Component';
    const displayName = `withTableSorting(${componentName})`;

    function defaultCompareFunction(itemA: I, itemB: I, columnId: string) {
        if (itemA[columnId] === itemB[columnId]) {
            return 0;
        } else {
            return itemA[columnId] > itemB[columnId] ? 1 : -1;
        }
    }

    return class extends React.Component<
        TableProps<I> & WithTableSortingProps & E,
        WithTableSortingState
    > {
        static displayName = displayName;

        state: WithTableSortingState = {
            sort: this.props.defaultSortState ?? [],
        };

        render() {
            const {columns, ...restTableProps} = this.props;

            return (
                <TableComponent
                    {...(restTableProps as Omit<TableProps<I>, 'columns'> & E)}
                    data={this.getSortedData()}
                    columns={this.enhanceColumns(columns)}
                />
            );
        }

        private getSortedData() {
            const {data, columns} = this.props;
            const sortState = this.getSortState();

            if (this.isControlledState() || sortState.length === 0) {
                return data;
            }

            return data.slice().sort((itemA, itemB) => {
                let i = 0;
                while (i < sortState.length) {
                    const state = sortState[i++];
                    const column = columns.find((c) => c.id === state.column);
                    const compareFunction = column?.meta?.sort;

                    if (!compareFunction) {
                        continue;
                    }

                    const compareValue =
                        typeof compareFunction === 'function'
                            ? compareFunction(itemA, itemB)
                            : defaultCompareFunction(itemA, itemB, state.column);

                    if (compareValue !== 0) {
                        return state.order === 'asc' ? compareValue : -compareValue;
                    }
                }

                return 0;
            });
        }

        // eslint-disable-next-line @typescript-eslint/member-ordering
        private enhanceColumns = _memoize((columns: TableColumnConfig<I>[]) => {
            return columns.map((column) => {
                const meta = column.meta;

                if (meta && meta.sort) {
                    return {
                        ...column,
                        meta: {
                            ...column.meta,
                            _originalName: column.name,
                        },
                        name: () => {
                            const sortState = this.getSortState();
                            let sortOrder: ColumnSortOrder | undefined;

                            if (sortState.length > 0) {
                                const state = sortState.find((s) => s.column === column.id);

                                if (state) {
                                    sortOrder = state.order;
                                }
                            }

                            const originContent = Table.getHeadCellContent(column);
                            const content = [
                                <div key="content" className={b('sort-content')}>
                                    {originContent}
                                </div>,
                                <div key="spacer" className={b('sort-spacer')} />,
                                <div key="indicator" className={b('sort-indicator')}>
                                    <SortIndicator
                                        order={sortOrder || this.getColumnDefaultSortOrder(column)}
                                    />
                                </div>,
                            ];

                            if (column.align === 'right') {
                                content.reverse();
                            }

                            return (
                                <div
                                    className={b('sort', {active: Boolean(sortOrder)})}
                                    onClick={this.handleColumnSortClick.bind(this, column)}
                                >
                                    {content}
                                </div>
                            );
                        },
                    } as TableColumnConfig<I>;
                } else {
                    return column;
                }
            });
        });

        private handleColumnSortClick = (column: TableColumnConfig<I>, event: React.MouseEvent) => {
            const sortState = this.getSortState();
            const currentStateIndex = sortState.findIndex((state) => state.column === column.id);
            const currentState = sortState[currentStateIndex];
            const nextColumnSort = this.getNextSortForColumn(column, currentState);

            if (!event.shiftKey) {
                this.handleSortStateChange(nextColumnSort);
                return;
            }

            if (currentState) {
                this.handleSortStateChange([
                    ...sortState.slice(0, currentStateIndex),
                    ...sortState.slice(currentStateIndex + 1),
                    ...nextColumnSort,
                ]);
            } else {
                this.handleSortStateChange([...sortState, ...nextColumnSort]);
            }
        };

        private getSortState() {
            const {sortState} = this.props;
            const {sort} = this.state;

            return this.isControlledState() ? sortState! : sort;
        }

        private handleSortStateChange(newSortState: SortState) {
            const {onSortStateChange} = this.props;

            if (this.isControlledState()) {
                onSortStateChange!(newSortState);
            } else {
                this.setState({sort: newSortState});
            }
        }

        private isControlledState() {
            const {sortState, onSortStateChange} = this.props;
            return Boolean(sortState && onSortStateChange);
        }

        private getColumnDefaultSortOrder(column: TableColumnConfig<I>): ColumnSortOrder {
            return column.meta?.defaultSortOrder || 'asc';
        }

        private getNextSortForColumn(
            column: TableColumnConfig<I>,
            currentState?: ColumnSortState,
        ): ColumnSortState[] {
            const defaultOrder = this.getColumnDefaultSortOrder(column);
            const orderStack =
                defaultOrder === 'desc' ? ['desc', 'asc', undefined] : ['asc', 'desc', undefined];
            const currentIndex = orderStack.indexOf(currentState?.order);
            const nextIndex = (currentIndex + 1) % orderStack.length;
            const nextOrder = orderStack[nextIndex];

            if (!nextOrder) {
                return [];
            }

            return [{column: column.id, order: nextOrder as ColumnSortOrder}];
        }
    };
}
