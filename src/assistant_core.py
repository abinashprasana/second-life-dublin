"""Read-only evidence tools. The model proposes intent; Python owns every fact."""
import json
import math
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Use = Literal['Childcare', 'Study space', 'Repair workshop', 'Community hub']
USES = ('Childcare', 'Study space', 'Repair workshop', 'Community hub')
FIELDS = ('population', 'households', 'density', 'share0to14', 'share15to24', 'share65plus')


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Turn(StrictModel):
    role: Literal['user', 'assistant']
    content: str = Field(max_length=1200)


class Query(StrictModel):
    question: str = Field(min_length=1, max_length=1200)
    siteId: str = Field(max_length=40)
    selectedUses: list[Use] = Field(min_length=1, max_length=2)
    snapshotVersion: int
    snapshotBuild: str = Field(max_length=80)
    history: list[Turn] = Field(default_factory=list, max_length=6)
    action: Literal['auto', 'explain', 'compare', 'missing', 'search'] = 'auto'

    @model_validator(mode='after')
    def distinct_uses(self):
        if len(self.selectedUses) != len(set(self.selectedUses)):
            raise ValueError('Choose distinct uses')
        return self


class Threshold(StrictModel):
    field: Literal['population', 'households', 'density', 'share0to14', 'share15to24', 'share65plus']
    op: Literal['gt', 'gte', 'lt', 'lte', 'eq']
    value: float = Field(allow_inf_nan=False)

    @model_validator(mode='after')
    def range_check(self):
        if self.value < 0 or (self.field.startswith('share') and self.value > 1):
            raise ValueError('Shares must be fractions from 0 to 1; counts cannot be negative')
        return self


class Filters(StrictModel):
    text: str = Field(default='', max_length=120)
    evidence: Literal['all', 'scored', 'missing_osm'] = 'all'
    protected: Literal['any', 'yes', 'no', 'unknown'] = 'any'
    councilOwned: Literal['any', 'yes', 'no', 'unknown'] = 'any'
    onRegister: Literal['any', 'yes', 'no', 'unknown'] = 'any'
    activeCase: Literal['any', 'yes', 'no', 'unknown'] = 'any'
    thresholds: list[Threshold] = Field(default_factory=list, max_length=6)
    sortUse: Use | None = None
    topUse: Use | None = None
    direction: Literal['asc', 'desc'] = 'desc'
    limit: int = Field(default=134, ge=1, le=134)


class Intent(StrictModel):
    kind: Literal['explain', 'compare', 'missing', 'facts', 'search', 'unsupported', 'clarify']
    uses: list[Use] = Field(default_factory=list, max_length=2)
    fields: list[Literal['register', 'census', 'services', 'scores', 'checks']] = Field(default_factory=list, max_length=5)
    filters: Filters = Field(default_factory=Filters)


class EvidenceChoice(StrictModel):
    evidenceIds: list[str] = Field(min_length=1, max_length=6)


def load_snapshot(path: Path):
    from .export_web import validate_snapshot
    atlas = json.loads(path.read_text(encoding='utf-8-sig'))
    validate_snapshot(atlas)
    return atlas


def normalized_flag(value):
    value = str(value or '').strip().lower()
    return value if value in ('yes', 'no') else 'unknown'


def search_sites(atlas, filters: Filters):
    def matches(site):
        if filters.text.casefold() not in f"{site['id']} {site['title']} {site.get('address') or ''}".casefold():
            return False
        if filters.evidence != 'all' and site['coverage']['evidenceStatus'] != filters.evidence:
            return False
        for field in ('protected', 'councilOwned', 'onRegister', 'activeCase'):
            wanted = getattr(filters, field)
            if wanted != 'any' and normalized_flag(site['register'].get(field)) != wanted:
                return False
        for threshold in filters.thresholds:
            value = site['smallArea'].get(threshold.field)
            if value is None or not math.isfinite(value):
                return False
            if not {'gt': value > threshold.value, 'gte': value >= threshold.value,
                    'lt': value < threshold.value, 'lte': value <= threshold.value,
                    'eq': value == threshold.value}[threshold.op]:
                return False
        if filters.topUse:
            scored = [u for u in site['uses'] if u['score'] is not None]
            wanted = next((u for u in scored if u['use'] == filters.topUse), None)
            if not wanted or wanted['score'] != max(u['score'] for u in scored):
                return False
        return True
    found = sorted((s for s in atlas['sites'] if matches(s)), key=lambda s: s['id'])
    if filters.sortUse:
        def score(s):
            return next(u['score'] for u in s['uses'] if u['use'] == filters.sortUse)
        found = [s for s in found if score(s) is not None]
        found.sort(key=score, reverse=filters.direction == 'desc')
    return found[:filters.limit]


def filter_labels(filters: Filters):
    labels = []
    if filters.text:
        labels.append(f'Address or ID contains “{filters.text}”')
    if filters.evidence != 'all':
        labels.append('Service evidence cached' if filters.evidence == 'scored' else 'Service evidence missing')
    for field, name in [('protected','Protected flag'), ('councilOwned','Council-owned flag'),
                        ('onRegister','On-register flag'), ('activeCase','Active-case flag')]:
        if getattr(filters, field) != 'any':
            labels.append(f'{name}: {getattr(filters, field)}')
    symbols = {'gt':'>','gte':'≥','lt':'<','lte':'≤','eq':'='}
    for threshold in filters.thresholds:
        value = f'{threshold.value * 100:g}%' if threshold.field.startswith('share') else f'{threshold.value:g}'
        labels.append(f'{threshold.field} {symbols[threshold.op]} {value}')
    if filters.topUse:
        labels.append(f'{filters.topUse} is a highest-scoring use (ties included)')
    if filters.sortUse:
        labels.append(f'{filters.sortUse} score: {"highest" if filters.direction == "desc" else "lowest"} first · scored sites only')
    if filters.limit < 134:
        labels.append(f'Up to {filters.limit} sites')
    return labels or ['All registered sites']


def evidence_for(atlas, site):
    refs = {}
    sources = atlas['metadata']['sources']
    def add(key, label, text, source, section, value=None):
        refs[key] = {'id':key, 'label':label, 'text':text, 'value':value, 'section':section,
                     'source':source['name'], 'url':source['url'], 'retrieved':source['retrieved']}
    for key, label in [('dateAdded','Added to register'), ('protected','Protected structure flag'),
                       ('councilOwned','Council ownership flag'), ('onRegister','On register'), ('activeCase','Active case')]:
        value = site['register'].get(key)
        add(f'register.{key}',label,f'{label}: {value or "Not available"}.',sources[0],'register',value)
    for key in FIELDS:
        value = site['smallArea'].get(key)
        shown = 'Not available' if value is None else f'{value*100:.1f}%' if key.startswith('share') else f'{value:,.1f}'.removesuffix('.0')
        add(f'census.{key}',key,f'Small Area {key}: {shown}. This describes the area, not the building.',sources[1],'census',value)
    for use in site['uses']:
        key = 'use.' + str(USES.index(use['use']))
        score = 'Not available' if use['score'] is None else f"{use['score']:.1f}/100"
        add(key,use['use'],f"{use['use']} evidence score: {score}. " + ' '.join(use['facts']),
            {**sources[3], 'name':'Computed score · CSO + cached OpenStreetMap', 'retrieved':site['coverage']['osmRetrieved'] or sources[3]['retrieved']},'scores',use['score'])
    add('coverage','Evidence availability',
        'Nearby-service evidence is cached; service tags may be incomplete.' if site['coverage']['hasOsm'] else
        'Nearby-service evidence is not cached. All four scores are unavailable; no ranking can be made.',sources[3],'services')
    for i, question in enumerate(site['unanswered']):
        add(f'check.{i}','Next check',question,sources[0],'checks')
    return refs


def choose_evidence(intent, refs, selected_uses):
    uses = intent.uses or selected_uses
    if intent.kind == 'compare':
        uses = list(dict.fromkeys(uses + list(selected_uses) + list(USES)))[:2]
    if intent.kind in ('explain','compare'):
        return ['use.' + str(USES.index(u)) for u in uses[:2]] + ['coverage']
    if intent.kind == 'missing':
        return ['coverage'] + [k for k in refs if k.startswith('check.')]
    return [k for k,v in refs.items() if v['section'] in (intent.fields or ['register','census'])]


def answer_from_evidence(intent, refs, chosen, site):
    if not chosen or any(key not in refs for key in chosen):
        raise ValueError('The local model returned an unknown evidence reference')
    blocks = [{'kind':'next_checks' if refs[key]['section']=='checks' else 'evidence','text':refs[key]['text'],'evidenceIds':[key]} for key in dict.fromkeys(chosen)]
    if not site['coverage']['hasOsm']:
        blocks.append({'kind':'uncertainty','text':'The four uses cannot be ranked until nearby-service evidence is collected. Register and census facts remain available.','evidenceIds':['coverage']})
    else:
        blocks.append({'kind':'uncertainty','text':'Service factors compare eight cached sites. Census factors use available sites. Scores are discussion leads, not proof of demand or feasibility. Missing tags do not prove absence.','evidenceIds':['coverage']})
    blocks.append({'kind':'next_checks','text':'Confirm condition, ownership, planning requirements and heritage constraints locally before deciding on a use.','evidenceIds':[k for k in refs if k.startswith('check.')]})
    used = {key for block in blocks for key in block['evidenceIds']}
    return blocks, [ref for key,ref in refs.items() if key in used]
