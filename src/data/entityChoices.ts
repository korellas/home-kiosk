export interface EntityChoice {
  id: string;
  name: string;
  domain: string;
  state: string;
  area_id: string | null;
  device_name?: string;
  unit?: string;
  device_class?: string;
  hvac_modes?: string[];
  supported_color_modes?: string[];
}

export interface EntityCatalog {
  areas: { id: string; name: string }[];
  entities: EntityChoice[];
}

export function filterEntityChoices(entities: EntityChoice[], filter: {
  domains: string[];
  area: string;
  query: string;
  deviceClass?: string;
  selectedIds?: readonly string[];
}) {
  const query = filter.query.trim().toLocaleLowerCase();
  return entities.filter(entity => filter.selectedIds?.includes(entity.id) || (
    filter.domains.includes(entity.domain)
    && (filter.area === "*" || (entity.area_id ?? "") === filter.area)
    && (!filter.deviceClass || entity.device_class === filter.deviceClass)
    && `${entity.name} ${entity.device_name ?? ""} ${entity.id}`.toLocaleLowerCase().includes(query)
  ));
}
