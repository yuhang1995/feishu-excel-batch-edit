import './App.css';
import {
  bitable,
  checkers,
  FieldType,
  IField,
  IFieldMeta,
  IObjectFieldMeta,
  IOpenAttachment,
  IOpenCellValue,
  IOpenGroupChat,
  IOpenLink,
  IOpenLocation,
  IOpenUser,
  IRecord,
  ITable,
  ITableMeta,
  IViewMeta,
  ToastType,
} from '@lark-base-open/js-sdk';
import {
  Button,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  TextArea,
  Upload,
  Typography
} from '@douyinfe/semi-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';

type AnyField = IField<any, any, any>;

type SelectOption = {
  id: string;
  name: string;
};

type CandidateOption = {
  id: string;
  label: string;
  raw?: unknown;
};

type FilterOperatorId =
  | 'contains'
  | 'notContains'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'is'
  | 'isNot'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'hasAny'
  | 'notHasAny'
  | 'before'
  | 'after';

type FilterKind =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'singleSelect'
  | 'multiSelect'
  | 'dateTime'
  | 'entity'
  | 'link'
  | 'attachment';

type EditorKind =
  | 'readonly'
  | 'text'
  | 'number'
  | 'checkbox'
  | 'singleSelect'
  | 'multiSelect'
  | 'dateTime'
  | 'entity'
  | 'link'
  | 'attachment'
  | 'location'
  | 'object';

type LocationDraft = {
  name: string;
  address: string;
  fullAddress: string;
  location: string;
  adname: string;
  cityname: string;
  pname: string;
};

type ValueDraft = {
  textValue: string;
  numberValue: number | undefined;
  dateValue: number | undefined;
  booleanValue: boolean | undefined;
  selectIds: string[];
  entityIds: string[];
  attachmentFiles: File[];
  locationValue: LocationDraft;
  objectValue: Record<string, unknown>;
};

type FilterCondition = {
  id: string;
  fieldId: string;
  operator: FilterOperatorId;
  draft: ValueDraft;
};

type FieldCapability = {
  meta: IFieldMeta;
  field: AnyField;
  editable: boolean;
  disabledReason?: string;
  editorKind: EditorKind;
  filterKind: FilterKind;
  operators: FilterOperatorId[];
  multiple: boolean;
  linkTableId?: string;
  selectOptions: SelectOption[];
  objectProperties: Array<IObjectFieldMeta['property']['properties'][number]>;
};

const MAX_BATCH_SIZE = 200;
let filterConditionSeed = 0;

const OPERATOR_LABELS: Record<FilterOperatorId, string> = {
  contains: '包含',
  notContains: '不包含',
  isEmpty: '为空',
  isNotEmpty: '不为空',
  is: '等于',
  isNot: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  hasAny: '包含任一',
  notHasAny: '不包含任一',
  before: '早于',
  after: '晚于',
};

function createLocationDraft(): LocationDraft {
  return {
    name: '',
    address: '',
    fullAddress: '',
    location: '',
    adname: '',
    cityname: '',
    pname: '',
  };
}

function createValueDraft(): ValueDraft {
  return {
    textValue: '',
    numberValue: undefined,
    dateValue: undefined,
    booleanValue: undefined,
    selectIds: [],
    entityIds: [],
    attachmentFiles: [],
    locationValue: createLocationDraft(),
    objectValue: {},
  };
}

function getSelectOptions(fieldMeta?: IFieldMeta): SelectOption[] {
  if (!fieldMeta) {
    return [];
  }
  if (fieldMeta.type !== FieldType.SingleSelect && fieldMeta.type !== FieldType.MultiSelect) {
    return [];
  }
  const property = (fieldMeta as IFieldMeta & { property?: { options?: SelectOption[] } }).property;
  return Array.isArray(property?.options) ? property.options : [];
}

function getFieldMultiple(fieldMeta: IFieldMeta): boolean {
  const property = (fieldMeta as IFieldMeta & { property?: { multiple?: boolean } }).property;
  return Boolean(property?.multiple);
}

function getFieldLabel(fieldMeta: IFieldMeta): string {
  return `${fieldMeta.name} (${FieldType[fieldMeta.type]})`;
}

function getOperatorOptions(operators: FilterOperatorId[]) {
  return operators.map((operator) => ({
    id: operator,
    label: OPERATOR_LABELS[operator],
  }));
}

function getDefaultOperators(filterKind: FilterKind): FilterOperatorId[] {
  switch (filterKind) {
    case 'text':
      return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'];
    case 'number':
      return ['is', 'isNot', 'gt', 'gte', 'lt', 'lte', 'isEmpty', 'isNotEmpty'];
    case 'checkbox':
      return ['is'];
    case 'singleSelect':
      return ['is', 'isNot', 'isEmpty', 'isNotEmpty'];
    case 'multiSelect':
      return ['hasAny', 'notHasAny', 'isEmpty', 'isNotEmpty'];
    case 'dateTime':
      return ['is', 'after', 'before', 'isEmpty', 'isNotEmpty'];
    case 'entity':
    case 'link':
      return ['hasAny', 'notHasAny', 'isEmpty', 'isNotEmpty'];
    case 'attachment':
      return ['isEmpty', 'isNotEmpty'];
    default:
      return ['contains'];
  }
}

function getFilterKind(fieldMeta: IFieldMeta): FilterKind {
  switch (fieldMeta.type) {
    case FieldType.Number:
    case FieldType.Currency:
    case FieldType.Progress:
    case FieldType.Rating:
    case FieldType.AutoNumber:
      return 'number';
    case FieldType.Checkbox:
      return 'checkbox';
    case FieldType.SingleSelect:
      return 'singleSelect';
    case FieldType.MultiSelect:
      return 'multiSelect';
    case FieldType.DateTime:
    case FieldType.CreatedTime:
    case FieldType.ModifiedTime:
      return 'dateTime';
    case FieldType.User:
    case FieldType.GroupChat:
    case FieldType.CreatedUser:
    case FieldType.ModifiedUser:
      return 'entity';
    case FieldType.SingleLink:
    case FieldType.DuplexLink:
      return 'link';
    case FieldType.Attachment:
      return 'attachment';
    default:
      return 'text';
  }
}

function getEditorKind(fieldMeta: IFieldMeta, editable: boolean): EditorKind {
  if (!editable) {
    return 'readonly';
  }

  switch (fieldMeta.type) {
    case FieldType.Text:
    case FieldType.Barcode:
    case FieldType.Url:
    case FieldType.Email:
    case FieldType.Phone:
      return 'text';
    case FieldType.Number:
    case FieldType.Currency:
    case FieldType.Progress:
    case FieldType.Rating:
      return 'number';
    case FieldType.Checkbox:
      return 'checkbox';
    case FieldType.SingleSelect:
      return 'singleSelect';
    case FieldType.MultiSelect:
      return 'multiSelect';
    case FieldType.DateTime:
      return 'dateTime';
    case FieldType.User:
    case FieldType.GroupChat:
      return 'entity';
    case FieldType.SingleLink:
    case FieldType.DuplexLink:
      return 'link';
    case FieldType.Attachment:
      return 'attachment';
    case FieldType.Location:
      return 'location';
    case FieldType.Object:
      return 'object';
    default:
      return 'readonly';
  }
}

function getDisabledReason(fieldMeta: IFieldMeta, editable: boolean): string | undefined {
  if (editable) {
    return undefined;
  }

  switch (fieldMeta.type) {
    case FieldType.Formula:
    case FieldType.Lookup:
      return '计算字段不可批量修改';
    case FieldType.CreatedTime:
    case FieldType.ModifiedTime:
    case FieldType.CreatedUser:
    case FieldType.ModifiedUser:
    case FieldType.AutoNumber:
      return '系统字段不可批量修改';
    default:
      return '当前字段不可批量修改';
  }
}

function createFilterCondition(fieldId = '', operator: FilterOperatorId = 'contains', id = `filter-${(filterConditionSeed += 1)}`): FilterCondition {
  return {
    id,
    fieldId,
    operator,
    draft: createValueDraft(),
  };
}

function isOperatorWithoutValue(operator: FilterOperatorId): boolean {
  return operator === 'isEmpty' || operator === 'isNotEmpty';
}

function normalizeTimestamp(value: unknown): number | undefined {
  if (value === null || typeof value === 'undefined' || value === '') {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'object' && value && typeof (value as { valueOf?: () => unknown }).valueOf === 'function') {
    const nextValue = (value as { valueOf: () => unknown }).valueOf();
    if (typeof nextValue === 'number' && Number.isFinite(nextValue)) {
      return nextValue;
    }
  }
  const timestamp = new Date(String(value)).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function getNumericCellValue(cellValue: IOpenCellValue): number | undefined {
  if (checkers.isNumber(cellValue)) {
    return cellValue;
  }
  if (checkers.isAutoNumber(cellValue)) {
    if (typeof cellValue === 'string') {
      const value = Number(cellValue);
      return Number.isNaN(value) ? undefined : value;
    }
    const value = Number(cellValue.value);
    return Number.isNaN(value) ? undefined : value;
  }
  return undefined;
}

function getEntityIdsFromCellValue(fieldType: FieldType, cellValue: IOpenCellValue): string[] {
  if (
    (fieldType === FieldType.User || fieldType === FieldType.CreatedUser || fieldType === FieldType.ModifiedUser) &&
    checkers.isUsers(cellValue)
  ) {
    return cellValue.map((item) => item.id);
  }
  if (fieldType === FieldType.GroupChat && checkers.isGroupChats(cellValue)) {
    return cellValue.map((item) => item.id);
  }
  return [];
}

function getLinkIdsFromCellValue(cellValue: IOpenCellValue): string[] {
  if (!checkers.isLink(cellValue)) {
    return [];
  }
  return Array.isArray(cellValue.recordIds) ? cellValue.recordIds : [];
}

function getMultiSelectIds(cellValue: IOpenCellValue): string[] {
  if (!checkers.isMultiSelect(cellValue)) {
    return [];
  }
  return cellValue.map((item) => item.id);
}

function getSingleSelectId(cellValue: IOpenCellValue): string | undefined {
  if (!checkers.isSingleSelect(cellValue)) {
    return undefined;
  }
  return cellValue.id;
}

function hasAnyIntersection(left: string[], right: string[]): boolean {
  const rightSet = new Set(right);
  return left.some((item) => rightSet.has(item));
}

function isTextEmpty(value: string): boolean {
  return value.trim() === '';
}

async function matchFilterCondition(
  table: ITable,
  capability: FieldCapability,
  recordId: string,
  condition: FilterCondition,
): Promise<boolean> {
  const { operator, draft } = condition;

  if (capability.filterKind === 'attachment') {
    const cellValue = await table.getCellValue(capability.meta.id, recordId);
    const hasValue = checkers.isAttachments(cellValue) && cellValue.length > 0;
    return operator === 'isEmpty' ? !hasValue : hasValue;
  }

  if (capability.filterKind === 'text') {
    const cellText = await table.getCellString(capability.meta.id, recordId);
    switch (operator) {
      case 'contains':
        return cellText.includes(draft.textValue.trim());
      case 'notContains':
        return !cellText.includes(draft.textValue.trim());
      case 'isEmpty':
        return isTextEmpty(cellText);
      case 'isNotEmpty':
        return !isTextEmpty(cellText);
      default:
        return false;
    }
  }

  const cellValue = await table.getCellValue(capability.meta.id, recordId);

  if (capability.filterKind === 'number') {
    const numericValue = getNumericCellValue(cellValue);
    switch (operator) {
      case 'is':
        return typeof numericValue === 'number' && numericValue === draft.numberValue;
      case 'isNot':
        return typeof numericValue === 'number' && numericValue !== draft.numberValue;
      case 'gt':
        return typeof numericValue === 'number' && typeof draft.numberValue === 'number' && numericValue > draft.numberValue;
      case 'gte':
        return typeof numericValue === 'number' && typeof draft.numberValue === 'number' && numericValue >= draft.numberValue;
      case 'lt':
        return typeof numericValue === 'number' && typeof draft.numberValue === 'number' && numericValue < draft.numberValue;
      case 'lte':
        return typeof numericValue === 'number' && typeof draft.numberValue === 'number' && numericValue <= draft.numberValue;
      case 'isEmpty':
        return typeof numericValue !== 'number';
      case 'isNotEmpty':
        return typeof numericValue === 'number';
      default:
        return false;
    }
  }

  if (capability.filterKind === 'checkbox') {
    const checked = checkers.isCheckbox(cellValue) ? cellValue : undefined;
    return typeof checked === 'boolean' && checked === draft.booleanValue;
  }

  if (capability.filterKind === 'singleSelect') {
    const selectedId = getSingleSelectId(cellValue);
    switch (operator) {
      case 'is':
        return Boolean(selectedId) && selectedId === draft.selectIds[0];
      case 'isNot':
        return Boolean(selectedId) && selectedId !== draft.selectIds[0];
      case 'isEmpty':
        return !selectedId;
      case 'isNotEmpty':
        return Boolean(selectedId);
      default:
        return false;
    }
  }

  if (capability.filterKind === 'multiSelect') {
    const ids = getMultiSelectIds(cellValue);
    switch (operator) {
      case 'hasAny':
        return ids.length > 0 && hasAnyIntersection(ids, draft.selectIds);
      case 'notHasAny':
        return !hasAnyIntersection(ids, draft.selectIds);
      case 'isEmpty':
        return ids.length === 0;
      case 'isNotEmpty':
        return ids.length > 0;
      default:
        return false;
    }
  }

  if (capability.filterKind === 'dateTime') {
    const timestamp = checkers.isTimestamp(cellValue) ? cellValue : undefined;
    switch (operator) {
      case 'is':
        return typeof timestamp === 'number' && timestamp === draft.dateValue;
      case 'after':
        return typeof timestamp === 'number' && typeof draft.dateValue === 'number' && timestamp > draft.dateValue;
      case 'before':
        return typeof timestamp === 'number' && typeof draft.dateValue === 'number' && timestamp < draft.dateValue;
      case 'isEmpty':
        return typeof timestamp !== 'number';
      case 'isNotEmpty':
        return typeof timestamp === 'number';
      default:
        return false;
    }
  }

  if (capability.filterKind === 'entity') {
    const ids = getEntityIdsFromCellValue(capability.meta.type, cellValue);
    switch (operator) {
      case 'hasAny':
        return ids.length > 0 && hasAnyIntersection(ids, draft.entityIds);
      case 'notHasAny':
        return !hasAnyIntersection(ids, draft.entityIds);
      case 'isEmpty':
        return ids.length === 0;
      case 'isNotEmpty':
        return ids.length > 0;
      default:
        return false;
    }
  }

  if (capability.filterKind === 'link') {
    const ids = getLinkIdsFromCellValue(cellValue);
    switch (operator) {
      case 'hasAny':
        return ids.length > 0 && hasAnyIntersection(ids, draft.entityIds);
      case 'notHasAny':
        return !hasAnyIntersection(ids, draft.entityIds);
      case 'isEmpty':
        return ids.length === 0;
      case 'isNotEmpty':
        return ids.length > 0;
      default:
        return false;
    }
  }

  return false;
}

function buildCapability(fieldMeta: IFieldMeta, field: AnyField, editable: boolean): FieldCapability {
  const filterKind = getFilterKind(fieldMeta);
  const editorKind = getEditorKind(fieldMeta, editable);
  const property = (fieldMeta as IFieldMeta & { property?: { tableId?: string } }).property;
  const objectProperties = fieldMeta.type === FieldType.Object
    ? ((fieldMeta as IObjectFieldMeta).property?.properties ?? []).filter((item) => !item.hidden)
    : [];

  return {
    meta: fieldMeta,
    field,
    editable,
    disabledReason: getDisabledReason(fieldMeta, editable),
    editorKind,
    filterKind,
    operators: getDefaultOperators(filterKind),
    multiple: getFieldMultiple(fieldMeta) || fieldMeta.type === FieldType.MultiSelect,
    linkTableId: property?.tableId,
    selectOptions: getSelectOptions(fieldMeta),
    objectProperties,
  };
}

function createDisabledFieldLabel(capability: FieldCapability): string {
  if (!capability.disabledReason) {
    return getFieldLabel(capability.meta);
  }
  return `${getFieldLabel(capability.meta)} - ${capability.disabledReason}`;
}

function getPropertySelectOptions(property: IObjectFieldMeta['property']['properties'][number]): SelectOption[] {
  const extra = property.extra as { options?: SelectOption[] } | undefined;
  const options = extra?.options;
  return Array.isArray(options) ? options : [];
}

function isSimpleTextType(fieldType: FieldType): boolean {
  return [
    FieldType.Text,
    FieldType.Barcode,
    FieldType.Url,
    FieldType.Email,
    FieldType.Phone,
  ].includes(fieldType);
}

function isSimpleNumberType(fieldType: FieldType): boolean {
  return [
    FieldType.Number,
    FieldType.Currency,
    FieldType.Progress,
    FieldType.Rating,
  ].includes(fieldType);
}

export default function App() {
  const [tableMetaList, setTableMetaList] = useState<ITableMeta[]>([]);
  const [fieldCapabilities, setFieldCapabilities] = useState<FieldCapability[]>([]);
  const [viewMetaList, setViewMetaList] = useState<IViewMeta[]>([]);
  const [tableId, setTableId] = useState<string>('');
  const [viewId, setViewId] = useState<string>('');
  const [fieldId, setFieldId] = useState<string>('');
  const [filterConditions, setFilterConditions] = useState<FilterCondition[]>([]);
  const [recordIds, setRecordIds] = useState<string[]>([]);
  const [editorDraft, setEditorDraft] = useState<ValueDraft>(createValueDraft());
  const [editorResetToken, setEditorResetToken] = useState<number>(0);
  const [fieldOptionMap, setFieldOptionMap] = useState<Record<string, CandidateOption[]>>({});
  const [loadingOptionFieldIds, setLoadingOptionFieldIds] = useState<string[]>([]);
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const capabilityMap = useMemo(
    () => new Map(fieldCapabilities.map((capability) => [capability.meta.id, capability])),
    [fieldCapabilities],
  );

  const selectedFieldCapability = useMemo(
    () => capabilityMap.get(fieldId),
    [capabilityMap, fieldId],
  );

  const filterableFieldList = useMemo(() => fieldCapabilities, [fieldCapabilities]);
  const changeableFieldList = useMemo(() => fieldCapabilities, [fieldCapabilities]);

  const resetEditorDraft = useCallback(() => {
    setEditorDraft(createValueDraft());
    setEditorResetToken((current) => current + 1);
  }, []);

  const loadFieldCapabilities = useCallback(async (table: ITable, metas: IFieldMeta[]): Promise<FieldCapability[]> => {
    const capabilities = await Promise.all(
      metas.map(async (meta) => {
        const field = await table.getFieldById(meta.id);
        let editable = false;
        try {
          editable = Boolean(field.getEditable());
        } catch {
          editable = false;
        }
        return buildCapability(meta, field, editable);
      }),
    );
    return capabilities;
  }, []);

  const loadFieldMeta = useCallback(async (nextTableId: string, preferredViewId?: string) => {
    if (!nextTableId) {
      setFieldCapabilities([]);
      setViewMetaList([]);
      setViewId('');
      setFieldId('');
      setFilterConditions([]);
      setFieldOptionMap({});
      setRecordIds([]);
      resetEditorDraft();
      return;
    }

    const table = await bitable.base.getTableById(nextTableId);
    const [fieldMetas, views] = await Promise.all([table.getFieldMetaList(), table.getViewMetaList()]);
    const capabilities = await loadFieldCapabilities(table, fieldMetas);

    setFieldCapabilities(capabilities);
    setViewMetaList(views);
    setFieldOptionMap({});

    const resolvedViewId = preferredViewId || views[0]?.id || '';
    const firstEditableFieldId = capabilities.find((item) => item.editable)?.meta.id || capabilities[0]?.meta.id || '';
    const firstFilterCapability = capabilities[0];

    setViewId(resolvedViewId);
    setFieldId(firstEditableFieldId);
    setFilterConditions(
      firstFilterCapability
        ? [createFilterCondition(firstFilterCapability.meta.id, firstFilterCapability.operators[0])]
        : [],
    );
    setRecordIds([]);
    resetEditorDraft();
  }, [loadFieldCapabilities, resetEditorDraft]);

  useEffect(() => {
    Promise.all([bitable.base.getTableMetaList(), bitable.base.getSelection()]).then(
      async ([metaList, selection]) => {
        setTableMetaList(metaList);
        const nextTableId = selection.tableId || metaList[0]?.id || '';
        setTableId(nextTableId);
        if (nextTableId) {
          await loadFieldMeta(nextTableId, selection.viewId || undefined);
        }
      },
    );
  }, [loadFieldMeta]);

  useEffect(() => {
    if (!fieldCapabilities.length) {
      setFieldId('');
      setFilterConditions([]);
      return;
    }

    setFieldId((current) => {
      const currentCapability = current ? capabilityMap.get(current) : undefined;
      if (currentCapability?.editable) {
        return current;
      }
      return fieldCapabilities.find((item) => item.editable)?.meta.id || '';
    });

    setFilterConditions((current) => {
      if (!current.length) {
        const firstCapability = fieldCapabilities[0];
        return firstCapability
          ? [createFilterCondition(firstCapability.meta.id, firstCapability.operators[0])]
          : [];
      }

      let changed = false;
      const next = current.map((condition) => {
        const capability = capabilityMap.get(condition.fieldId);
        if (!capability) {
          changed = true;
          const firstCapability = fieldCapabilities[0];
          return firstCapability
            ? createFilterCondition(firstCapability.meta.id, firstCapability.operators[0], condition.id)
            : condition;
        }
        if (!capability.operators.includes(condition.operator)) {
          changed = true;
          return createFilterCondition(capability.meta.id, capability.operators[0], condition.id);
        }
        return condition;
      });

      return changed ? next : current;
    });
  }, [capabilityMap, fieldCapabilities]);

  const updateFilterCondition = useCallback((id: string, updater: (condition: FilterCondition) => FilterCondition) => {
    setFilterConditions((current) =>
      current.map((condition) => (condition.id === id ? updater(condition) : condition)),
    );
  }, []);

  const addFilterCondition = useCallback(() => {
    const firstCapability = filterableFieldList[0];
    if (!firstCapability) {
      return;
    }
    setFilterConditions((current) => [
      ...current,
      createFilterCondition(firstCapability.meta.id, firstCapability.operators[0]),
    ]);
  }, [filterableFieldList]);

  const removeFilterCondition = useCallback((id: string) => {
    setFilterConditions((current) => {
      if (current.length <= 1) {
        const firstCapability = filterableFieldList[0];
        return firstCapability
          ? [createFilterCondition(firstCapability.meta.id, firstCapability.operators[0])]
          : [];
      }
      return current.filter((condition) => condition.id !== id);
    });
  }, [filterableFieldList]);

  const loadCandidateOptions = useCallback(async (fieldCapability: FieldCapability) => {
    const fieldIdToLoad = fieldCapability.meta.id;
    if (!tableId || fieldOptionMap[fieldIdToLoad] || loadingOptionFieldIds.includes(fieldIdToLoad)) {
      return;
    }
    if (fieldCapability.filterKind !== 'entity' && fieldCapability.filterKind !== 'link' && fieldCapability.editorKind !== 'entity' && fieldCapability.editorKind !== 'link') {
      return;
    }

    setLoadingOptionFieldIds((current) => [...current, fieldIdToLoad]);
    try {
      let options: CandidateOption[] = [];

      if (fieldCapability.filterKind === 'entity' || fieldCapability.editorKind === 'entity') {
        const values = await fieldCapability.field.getFieldValueList();
        const optionMap = new Map<string, CandidateOption>();
        for (const item of values) {
          const cellValue = item.value as IOpenCellValue;
          if (
            (fieldCapability.meta.type === FieldType.User ||
              fieldCapability.meta.type === FieldType.CreatedUser ||
              fieldCapability.meta.type === FieldType.ModifiedUser) &&
            checkers.isUsers(cellValue)
          ) {
            cellValue.forEach((user) => {
              if (!optionMap.has(user.id)) {
                optionMap.set(user.id, {
                  id: user.id,
                  label: user.name || user.email || user.id,
                  raw: user,
                });
              }
            });
          }
          if (fieldCapability.meta.type === FieldType.GroupChat && checkers.isGroupChats(cellValue)) {
            cellValue.forEach((group) => {
              if (!optionMap.has(group.id)) {
                optionMap.set(group.id, {
                  id: group.id,
                  label: group.name || group.id,
                  raw: group,
                });
              }
            });
          }
        }
        options = Array.from(optionMap.values());
      }

      if ((fieldCapability.filterKind === 'link' || fieldCapability.editorKind === 'link') && fieldCapability.linkTableId) {
        const linkedTable = await bitable.base.getTableById(fieldCapability.linkTableId);
        const [linkedFieldMetas, linkedRecordIds] = await Promise.all([
          linkedTable.getFieldMetaList(),
          linkedTable.getRecordIdList(),
        ]);
        const displayFieldId = linkedFieldMetas[0]?.id || '';
        options = await Promise.all(
          linkedRecordIds.map(async (recordId) => {
            const displayText = displayFieldId ? await linkedTable.getCellString(displayFieldId, recordId) : '';
            return {
              id: recordId,
              label: displayText ? `${recordId} ${displayText}` : recordId,
              raw: recordId,
            };
          }),
        );
      }

      setFieldOptionMap((current) => ({ ...current, [fieldIdToLoad]: options }));
    } finally {
      setLoadingOptionFieldIds((current) => current.filter((item) => item !== fieldIdToLoad));
    }
  }, [fieldOptionMap, loadingOptionFieldIds, tableId]);

  useEffect(() => {
    const requestedFieldIds = new Set<string>();
    filterConditions.forEach((condition) => {
      requestedFieldIds.add(condition.fieldId);
    });
    if (selectedFieldCapability) {
      requestedFieldIds.add(selectedFieldCapability.meta.id);
    }

    requestedFieldIds.forEach((requestedFieldId) => {
      const capability = capabilityMap.get(requestedFieldId);
      if (capability) {
        void loadCandidateOptions(capability);
      }
    });
  }, [capabilityMap, filterConditions, loadCandidateOptions, selectedFieldCapability]);

  const handleLoadRecordsByFilter = useCallback(async () => {
    if (!tableId || !viewId) {
      await bitable.ui.showToast({ toastType: ToastType.warning, message: '请先选择数据表和视图' });
      return;
    }

    setLoadingRecords(true);
    try {
      const table = await bitable.base.getTableById(tableId);
      const view = await table.getViewById(viewId);
      const visibleRecordIds = await view.getVisibleRecordIdList();
      let selected = (visibleRecordIds || []).filter((id): id is string => Boolean(id));

      const activeConditions = filterConditions.filter((condition) => {
        const capability = capabilityMap.get(condition.fieldId);
        if (!capability) {
          return false;
        }
        if (isOperatorWithoutValue(condition.operator)) {
          return true;
        }
        switch (capability.filterKind) {
          case 'text':
            return !isTextEmpty(condition.draft.textValue);
          case 'number':
            return typeof condition.draft.numberValue === 'number';
          case 'checkbox':
            return typeof condition.draft.booleanValue === 'boolean';
          case 'singleSelect':
            return Boolean(condition.draft.selectIds[0]);
          case 'multiSelect':
            return condition.draft.selectIds.length > 0;
          case 'dateTime':
            return typeof condition.draft.dateValue === 'number';
          case 'entity':
          case 'link':
            return condition.draft.entityIds.length > 0;
          case 'attachment':
            return true;
          default:
            return false;
        }
      });

      for (const condition of activeConditions) {
        const capability = capabilityMap.get(condition.fieldId);
        if (!capability) {
          continue;
        }

        const matchFlags = await Promise.all(
          selected.map((recordId) => matchFilterCondition(table, capability, recordId, condition)),
        );
        selected = selected.filter((_, index) => matchFlags[index]);
      }

      setRecordIds(selected);
      await bitable.ui.showToast({
        toastType: ToastType.success,
        message: `已加载筛选结果，共 ${selected.length} 条记录`,
      });
    } catch (error) {
      await bitable.ui.showToast({
        toastType: ToastType.error,
        message: `加载筛选结果失败：${String(error)}`,
      });
    } finally {
      setLoadingRecords(false);
    }
  }, [capabilityMap, filterConditions, tableId, viewId]);

  const buildEntityRawValue = useCallback((capability: FieldCapability, entityIds: string[]): unknown => {
    const options = fieldOptionMap[capability.meta.id] || [];
    const rawItems = entityIds.map((id) => options.find((item) => item.id === id)?.raw).filter(Boolean);
    if (!rawItems.length) {
      throw new Error('请至少选择一个实体值');
    }

    if (capability.meta.type === FieldType.User) {
      return capability.multiple ? (rawItems as IOpenUser[]) : (rawItems[0] as IOpenUser);
    }

    return rawItems as IOpenGroupChat[];
  }, [fieldOptionMap]);

  const buildEditorRawValue = useCallback((capability: FieldCapability): unknown => {
    switch (capability.editorKind) {
      case 'text': {
        const textValue = capability.meta.type === FieldType.Text ? editorDraft.textValue : editorDraft.textValue.trim();
        if (!textValue) {
          throw new Error('请输入目标值');
        }
        if (capability.meta.type === FieldType.Email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(textValue)) {
          throw new Error('邮箱格式不正确');
        }
        if (capability.meta.type === FieldType.Url) {
          try {
            new URL(textValue);
          } catch {
            throw new Error('URL 格式不正确');
          }
        }
        return textValue;
      }
      case 'number': {
        if (typeof editorDraft.numberValue !== 'number') {
          throw new Error('请输入数字目标值');
        }
        return editorDraft.numberValue;
      }
      case 'checkbox': {
        if (typeof editorDraft.booleanValue !== 'boolean') {
          throw new Error('请选择布尔目标值');
        }
        return editorDraft.booleanValue;
      }
      case 'singleSelect': {
        const nextId = editorDraft.selectIds[0];
        if (!nextId) {
          throw new Error('请选择单选目标值');
        }
        return nextId;
      }
      case 'multiSelect': {
        if (!editorDraft.selectIds.length) {
          throw new Error('请至少选择一个多选目标值');
        }
        return editorDraft.selectIds;
      }
      case 'dateTime': {
        if (typeof editorDraft.dateValue !== 'number') {
          throw new Error('请选择日期时间目标值');
        }
        return editorDraft.dateValue;
      }
      case 'entity': {
        return buildEntityRawValue(capability, editorDraft.entityIds);
      }
      case 'link': {
        if (!capability.linkTableId) {
          throw new Error('关联字段缺少关联表配置');
        }
        if (!editorDraft.entityIds.length) {
          throw new Error('请选择关联记录');
        }
        const linkValue: IOpenLink = {
          text: '',
          type: 'text',
          tableId: capability.linkTableId,
          recordIds: editorDraft.entityIds,
          table_id: capability.linkTableId,
          record_ids: editorDraft.entityIds,
        };
        return linkValue;
      }
      case 'attachment': {
        if (!editorDraft.attachmentFiles.length) {
          throw new Error('请先上传附件');
        }
        return editorDraft.attachmentFiles;
      }
      case 'location': {
        const { name, address, fullAddress, location, adname, cityname, pname } = editorDraft.locationValue;
        if (![name, address, fullAddress, location, adname, cityname, pname].every((item) => item.trim())) {
          throw new Error('请完整填写地点信息');
        }
        const locationValue: IOpenLocation = {
          name,
          address,
          fullAddress,
          location,
          adname,
          cityname,
          pname,
          full_address: fullAddress,
        };
        return locationValue;
      }
      case 'object': {
        if (!Object.keys(editorDraft.objectValue).length) {
          throw new Error('请至少填写一个对象属性');
        }
        return editorDraft.objectValue;
      }
      default:
        throw new Error(capability.disabledReason || '当前字段不可批量修改');
    }
  }, [buildEntityRawValue, editorDraft]);

  const canSubmit = Boolean(tableId && fieldId && recordIds.length && selectedFieldCapability?.editable && !submitting);

  const handleSubmit = useCallback(async () => {
    if (!selectedFieldCapability) {
      await bitable.ui.showToast({ toastType: ToastType.warning, message: '请选择字段' });
      return;
    }

    if (!selectedFieldCapability.editable) {
      await bitable.ui.showToast({
        toastType: ToastType.warning,
        message: selectedFieldCapability.disabledReason || '当前字段不可批量修改',
      });
      return;
    }

    if (!recordIds.length) {
      await bitable.ui.showToast({ toastType: ToastType.warning, message: '请先加载命中记录' });
      return;
    }

    setSubmitting(true);
    try {
      const rawValue = buildEditorRawValue(selectedFieldCapability);
      const transformedValue = (await selectedFieldCapability.field.transform(rawValue)) as IOpenCellValue;
      const records: IRecord[] = recordIds.map((recordId) => ({
        recordId,
        fields: {
          [selectedFieldCapability.meta.id]: transformedValue,
        },
      }));

      const table = await bitable.base.getTableById(tableId);
      const chunks: IRecord[][] = [];
      for (let index = 0; index < records.length; index += MAX_BATCH_SIZE) {
        chunks.push(records.slice(index, index + MAX_BATCH_SIZE));
      }

      let successCount = 0;
      let failCount = 0;
      let lastErrorMessage = '';

      for (const chunk of chunks) {
        try {
          await table.setRecords(chunk);
          successCount += chunk.length;
        } catch (error) {
          failCount += chunk.length;
          lastErrorMessage = String(error);
        }
      }

      if (failCount === 0) {
        await bitable.ui.showToast({
          toastType: ToastType.success,
          message: `批量更新完成，成功 ${successCount} 条`,
        });
      } else {
        await bitable.ui.showToast({
          toastType: ToastType.warning,
          message: `部分更新失败：成功 ${successCount} 条，失败 ${failCount} 条。${lastErrorMessage}`,
        });
      }
    } catch (error) {
      await bitable.ui.showToast({
        toastType: ToastType.error,
        message: `批量更新失败：${String(error)}`,
      });
    } finally {
      setSubmitting(false);
    }
  }, [buildEditorRawValue, recordIds, selectedFieldCapability, tableId]);

  const renderFilterValueInput = useCallback((capability: FieldCapability, condition: FilterCondition) => {
    if (isOperatorWithoutValue(condition.operator)) {
      return <div className="helper-text">当前操作符不需要输入值</div>;
    }

    if (capability.filterKind === 'text') {
      return (
        <Input
          value={condition.draft.textValue}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: { ...current.draft, textValue: value },
            }))
          }
          placeholder="输入筛选值"
        />
      );
    }

    if (capability.filterKind === 'number') {
      return (
        <InputNumber
          value={condition.draft.numberValue}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: {
                ...current.draft,
                numberValue: typeof value === 'number' ? value : undefined,
              },
            }))
          }
          style={{ width: '100%' }}
          placeholder="输入数字"
        />
      );
    }

    if (capability.filterKind === 'checkbox') {
      return (
        <Select
          value={typeof condition.draft.booleanValue === 'boolean' ? String(condition.draft.booleanValue) : ''}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: {
                ...current.draft,
                booleanValue: value === 'true' ? true : value === 'false' ? false : undefined,
              },
            }))
          }
          style={{ width: '100%' }}
          placeholder="选择布尔值"
        >
          <Select.Option value="true">true</Select.Option>
          <Select.Option value="false">false</Select.Option>
        </Select>
      );
    }

    if (capability.filterKind === 'singleSelect') {
      return (
        <Select
          value={condition.draft.selectIds[0] || ''}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: { ...current.draft, selectIds: value ? [String(value)] : [] },
            }))
          }
          style={{ width: '100%' }}
          placeholder="选择单选项"
        >
          {capability.selectOptions.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (capability.filterKind === 'multiSelect') {
      return (
        <Select
          value={condition.draft.selectIds}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: {
                ...current.draft,
                selectIds: Array.isArray(value) ? value.map((item) => String(item)) : [],
              },
            }))
          }
          style={{ width: '100%' }}
          multiple
          filter
          placeholder="选择多选项"
        >
          {capability.selectOptions.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (capability.filterKind === 'dateTime') {
      return (
        <DatePicker
          type="dateTime"
          value={condition.draft.dateValue}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: { ...current.draft, dateValue: normalizeTimestamp(value) },
            }))
          }
          style={{ width: '100%' }}
          placeholder="选择日期时间"
        />
      );
    }

    if (capability.filterKind === 'entity' || capability.filterKind === 'link') {
      const options = fieldOptionMap[capability.meta.id] || [];
      const loading = loadingOptionFieldIds.includes(capability.meta.id);

      return (
        <Select
          value={condition.draft.entityIds}
          onChange={(value) =>
            updateFilterCondition(condition.id, (current) => ({
              ...current,
              draft: {
                ...current.draft,
                entityIds: Array.isArray(value) ? value.map((item) => String(item)) : [],
              },
            }))
          }
          style={{ width: '100%' }}
          multiple
          filter
          loading={loading}
          placeholder="选择候选值"
        >
          {options.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      );
    }

    return <div className="helper-text">当前筛选类型不需要输入值</div>;
  }, [fieldOptionMap, loadingOptionFieldIds, updateFilterCondition]);

  const renderObjectPropertyEditor = useCallback((property: IObjectFieldMeta['property']['properties'][number]) => {
    const value = editorDraft.objectValue[property.key];
    const updatePropertyValue = (nextValue: unknown) => {
      setEditorDraft((current) => ({
        ...current,
        objectValue: {
          ...current.objectValue,
          [property.key]: nextValue,
        },
      }));
    };

    if (isSimpleTextType(property.propertyType)) {
      return (
        <Input
          value={typeof value === 'string' ? value : ''}
          onChange={(nextValue) => updatePropertyValue(nextValue)}
          placeholder={`输入 ${property.title}`}
        />
      );
    }

    if (isSimpleNumberType(property.propertyType)) {
      return (
        <InputNumber
          value={typeof value === 'number' ? value : undefined}
          onChange={(nextValue) => updatePropertyValue(typeof nextValue === 'number' ? nextValue : undefined)}
          style={{ width: '100%' }}
          placeholder={`输入 ${property.title}`}
        />
      );
    }

    if (property.propertyType === FieldType.Checkbox) {
      return (
        <Checkbox
          checked={Boolean(value)}
          onChange={(event) => updatePropertyValue(Boolean(event.target.checked))}
        >
          {property.title}
        </Checkbox>
      );
    }

    if (property.propertyType === FieldType.SingleSelect) {
      const options = getPropertySelectOptions(property);
      return (
        <Select
          value={typeof value === 'string' ? value : ''}
          onChange={(nextValue) => updatePropertyValue(String(nextValue || ''))}
          style={{ width: '100%' }}
          placeholder={`选择 ${property.title}`}
        >
          {options.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (property.propertyType === FieldType.MultiSelect) {
      const options = getPropertySelectOptions(property);
      return (
        <Select
          value={Array.isArray(value) ? value : []}
          onChange={(nextValue) => updatePropertyValue(Array.isArray(nextValue) ? nextValue.map((item) => String(item)) : [])}
          style={{ width: '100%' }}
          multiple
          placeholder={`选择 ${property.title}`}
        >
          {options.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (property.propertyType === FieldType.DateTime) {
      return (
        <DatePicker
          type="dateTime"
          value={typeof value === 'number' ? value : undefined}
          onChange={(nextValue) => updatePropertyValue(normalizeTimestamp(nextValue))}
          style={{ width: '100%' }}
          placeholder={`选择 ${property.title}`}
        />
      );
    }

    return (
      <TextArea
        value={typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : ''}
        onChange={(nextValue) => updatePropertyValue(nextValue)}
        autosize
        placeholder={`${property.title} 不支持专用控件，输入字符串或 JSON`}
      />
    );
  }, [editorDraft.objectValue]);

  const renderEditorInput = useCallback(() => {
    if (!selectedFieldCapability) {
      return <div>请选择一个字段后再设置目标值。</div>;
    }

    if (!selectedFieldCapability.editable) {
      return <div className="helper-text">{selectedFieldCapability.disabledReason || '当前字段不可批量修改'}</div>;
    }

    if (selectedFieldCapability.editorKind === 'text') {
      const useTextArea = selectedFieldCapability.meta.type === FieldType.Text;
      return useTextArea ? (
        <TextArea
          value={editorDraft.textValue}
          onChange={(value) => setEditorDraft((current) => ({ ...current, textValue: value }))}
          autosize
          placeholder="输入目标值"
        />
      ) : (
        <Input
          value={editorDraft.textValue}
          onChange={(value) => setEditorDraft((current) => ({ ...current, textValue: value }))}
          placeholder="输入目标值"
        />
      );
    }

    if (selectedFieldCapability.editorKind === 'number') {
      const property = (selectedFieldCapability.meta as IFieldMeta & { property?: { min?: number; max?: number } }).property;
      return (
        <InputNumber
          value={editorDraft.numberValue}
          onChange={(value) =>
            setEditorDraft((current) => ({
              ...current,
              numberValue: typeof value === 'number' ? value : undefined,
            }))
          }
          min={selectedFieldCapability.meta.type === FieldType.Progress ? 0 : property?.min}
          max={
            selectedFieldCapability.meta.type === FieldType.Progress
              ? 100
              : selectedFieldCapability.meta.type === FieldType.Rating
                ? (selectedFieldCapability.meta as IFieldMeta & { property?: { max?: number } }).property?.max
                : property?.max
          }
          style={{ width: '100%' }}
          placeholder="输入目标值"
        />
      );
    }

    if (selectedFieldCapability.editorKind === 'checkbox') {
      return (
        <Checkbox
          checked={Boolean(editorDraft.booleanValue)}
          onChange={(event) =>
            setEditorDraft((current) => ({
              ...current,
              booleanValue: Boolean(event.target.checked),
            }))
          }
        >
          勾选为 true，取消为 false
        </Checkbox>
      );
    }

    if (selectedFieldCapability.editorKind === 'singleSelect') {
      return (
        <Select
          value={editorDraft.selectIds[0] || ''}
          onChange={(value) =>
            setEditorDraft((current) => ({
              ...current,
              selectIds: value ? [String(value)] : [],
            }))
          }
          style={{ width: '100%' }}
          filter
          placeholder="选择单选值"
        >
          {selectedFieldCapability.selectOptions.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (selectedFieldCapability.editorKind === 'multiSelect') {
      return (
        <Select
          value={editorDraft.selectIds}
          onChange={(value) =>
            setEditorDraft((current) => ({
              ...current,
              selectIds: Array.isArray(value) ? value.map((item) => String(item)) : [],
            }))
          }
          style={{ width: '100%' }}
          multiple
          filter
          placeholder="选择多选值"
        >
          {selectedFieldCapability.selectOptions.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.name}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (selectedFieldCapability.editorKind === 'dateTime') {
      return (
        <DatePicker
          type="dateTime"
          value={editorDraft.dateValue}
          onChange={(value) =>
            setEditorDraft((current) => ({
              ...current,
              dateValue: normalizeTimestamp(value),
            }))
          }
          style={{ width: '100%' }}
          placeholder="选择日期时间"
        />
      );
    }

    if (selectedFieldCapability.editorKind === 'entity' || selectedFieldCapability.editorKind === 'link') {
      const options = fieldOptionMap[selectedFieldCapability.meta.id] || [];
      const loading = loadingOptionFieldIds.includes(selectedFieldCapability.meta.id);
      return (
        <Select
          value={editorDraft.entityIds}
          onChange={(value) =>
            setEditorDraft((current) => ({
              ...current,
              entityIds: Array.isArray(value) ? value.map((item) => String(item)) : [],
            }))
          }
          style={{ width: '100%' }}
          multiple={selectedFieldCapability.multiple}
          filter
          loading={loading}
          placeholder="选择目标值"
        >
          {options.map((option) => (
            <Select.Option key={option.id} value={option.id}>
              {option.label}
            </Select.Option>
          ))}
        </Select>
      );
    }

    if (selectedFieldCapability.editorKind === 'attachment') {
      return (
        <Upload
          key={`upload-${fieldId}-${editorResetToken}`}
          action=""
          uploadTrigger="custom"
          beforeUpload={() => false}
          multiple
          showClear
          prompt="上传附件后会在提交时统一写入"
          onChange={({ fileList }) =>
            setEditorDraft((current) => ({
              ...current,
              attachmentFiles: fileList.map((item) => item.fileInstance).filter(Boolean) as File[],
            }))
          }
        />
      );
    }

    if (selectedFieldCapability.editorKind === 'location') {
      return (
        <div className="complex-editor-grid">
          <Input
            value={editorDraft.locationValue.name}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, name: value },
              }))
            }
            placeholder="地点简称"
          />
          <Input
            value={editorDraft.locationValue.address}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, address: value },
              }))
            }
            placeholder="详细地址"
          />
          <Input
            value={editorDraft.locationValue.fullAddress}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, fullAddress: value },
              }))
            }
            placeholder="完整地址"
          />
          <Input
            value={editorDraft.locationValue.location}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, location: value },
              }))
            }
            placeholder="坐标，例如 116.3,39.9"
          />
          <Input
            value={editorDraft.locationValue.pname}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, pname: value },
              }))
            }
            placeholder="省"
          />
          <Input
            value={editorDraft.locationValue.cityname}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, cityname: value },
              }))
            }
            placeholder="市"
          />
          <Input
            value={editorDraft.locationValue.adname}
            onChange={(value) =>
              setEditorDraft((current) => ({
                ...current,
                locationValue: { ...current.locationValue, adname: value },
              }))
            }
            placeholder="区县"
          />
        </div>
      );
    }

    if (selectedFieldCapability.editorKind === 'object') {
      return (
        <div className="object-editor">
          {selectedFieldCapability.objectProperties.map((property) => (
            <div className="object-property-row" key={property.key}>
              <div className="object-property-title">{property.title}</div>
              {renderObjectPropertyEditor(property)}
            </div>
          ))}
        </div>
      );
    }

    return <div className="helper-text">当前字段暂未支持专用编辑器</div>;
  }, [
    editorDraft,
    editorResetToken,
    fieldId,
    fieldOptionMap,
    loadingOptionFieldIds,
    renderObjectPropertyEditor,
    selectedFieldCapability,
  ]);

  return (
    <main className="main">
      <Typography.Title>批量修改多行单字段</Typography.Title>

      <Form labelPosition="top">
        <Form.Slot label="说明">
          <Typography.Text>当前版本支持全字段筛选和全字段展示。只读或计算字段会显示但不可批量修改；筛选条件支持按字段类型选择常用操作符。</Typography.Text>
        </Form.Slot>

        <Form.Slot label="选择数据表">
          <Select
            placeholder="请选择数据表"
            value={tableId}
            style={{ width: '100%' }}
            onChange={async (value) => {
              const nextTableId = String(value || '');
              setTableId(nextTableId);
              await loadFieldMeta(nextTableId);
            }}
          >
            {tableMetaList.map(({ id, name }) => (
              <Select.Option key={id} value={id}>
                {name}
              </Select.Option>
            ))}
          </Select>
        </Form.Slot>

        <Form.Slot label="选择视图">
          <Select
            placeholder="请选择视图"
            value={viewId}
            style={{ width: '100%' }}
            onChange={(value) => {
              setViewId(String(value || ''));
              setRecordIds([]);
            }}
          >
            {viewMetaList.map(({ id, name }) => (
              <Select.Option key={id} value={id}>
                {name}
              </Select.Option>
            ))}
          </Select>
        </Form.Slot>

        <Form.Slot label="附加筛选（当前表内）">
          <div className="filter-conditions">
            {filterConditions.map((condition, index) => {
              const capability = capabilityMap.get(condition.fieldId);
              const operatorOptions = capability ? getOperatorOptions(capability.operators) : [];

              return (
                <div className="filter-condition-row" key={condition.id}>
                  <Select
                    placeholder="筛选字段"
                    value={condition.fieldId}
                    style={{ width: '28%' }}
                    filter
                    onChange={(value) => {
                      const nextFieldId = String(value || '');
                      const nextCapability = capabilityMap.get(nextFieldId);
                      updateFilterCondition(condition.id, () =>
                        createFilterCondition(
                          nextFieldId,
                          nextCapability?.operators[0] || 'contains',
                          condition.id,
                        ),
                      );
                    }}
                  >
                    {filterableFieldList.map((fieldCapability) => (
                      <Select.Option key={fieldCapability.meta.id} value={fieldCapability.meta.id}>
                        {getFieldLabel(fieldCapability.meta)}
                      </Select.Option>
                    ))}
                  </Select>

                  <Select
                    placeholder="操作符"
                    value={condition.operator}
                    style={{ width: '18%' }}
                    onChange={(value) =>
                      updateFilterCondition(condition.id, (current) => ({
                        ...current,
                        operator: String(value) as FilterOperatorId,
                      }))
                    }
                  >
                    {operatorOptions.map((option) => (
                      <Select.Option key={option.id} value={option.id}>
                        {option.label}
                      </Select.Option>
                    ))}
                  </Select>

                  <div className="filter-input-area">
                    {capability ? renderFilterValueInput(capability, condition) : <Input value="" disabled />}
                  </div>

                  <div className="filter-condition-actions">
                    <span>条件 {index + 1}</span>
                    <Button theme="borderless" onClick={() => removeFilterCondition(condition.id)}>
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}

            <Button onClick={addFilterCondition}>新增筛选条件</Button>
          </div>
        </Form.Slot>

        <Form.Slot label="选择更改字段">
          <Select
            placeholder="请选择字段"
            value={fieldId}
            style={{ width: '100%' }}
            filter
            onChange={(value) => {
              setFieldId(String(value || ''));
              resetEditorDraft();
            }}
          >
            {changeableFieldList.map((capability) => (
              <Select.Option
                key={capability.meta.id}
                value={capability.meta.id}
                disabled={!capability.editable}
              >
                {createDisabledFieldLabel(capability)}
              </Select.Option>
            ))}
          </Select>
        </Form.Slot>

        <Form.Slot label="筛选结果">
          <div className="record-select-row">
            <Button loading={loadingRecords} onClick={handleLoadRecordsByFilter}>
              加载筛选结果
            </Button>
            <span>命中 {recordIds.length} 条</span>
          </div>
        </Form.Slot>

        <Form.Slot label="选择目标更改值">
          {renderEditorInput()}
        </Form.Slot>

        <Button theme="solid" onClick={handleSubmit} loading={submitting} disabled={!canSubmit}>
          批量更新
        </Button>
      </Form>
    </main>
  );
}
