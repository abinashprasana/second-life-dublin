import asyncio
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from pydantic import ValidationError
from src.assistant_core import (Filters, Threshold, Query, Intent, EvidenceChoice, search_sites,
                                evidence_for, choose_evidence, answer_from_evidence)
from src import assistant_api as api

ATLAS = json.loads((Path(__file__).resolve().parents[1]/'web/public/data/atlas.json').read_text(encoding='utf-8'))


def unscored_copy(site):
    # Every register site now has cached OSM evidence; keep exercising the unscored path with a copy.
    site = copy.deepcopy(site)
    site['coverage'].update(hasOsm=False, evidenceStatus='missing_osm', osmRetrieved=None)
    for use in site['uses']:
        use['score'] = None
    return site


class AssistantToolsTests(unittest.TestCase):
    def test_filters_and_null_scores(self):
        self.assertEqual(len(search_sites(ATLAS,Filters(evidence='scored'))),ATLAS['metadata']['osmSiteCount'])
        unscored=ATLAS['metadata']['siteCount']-ATLAS['metadata']['osmSiteCount']
        self.assertEqual(len(search_sites(ATLAS,Filters(evidence='missing_osm'))),unscored)
        data=copy.deepcopy(ATLAS)
        data['sites'][0]=unscored_copy(data['sites'][0])
        self.assertEqual([s['id'] for s in search_sites(data,Filters(evidence='missing_osm'))],[data['sites'][0]['id']])
        self.assertEqual(search_sites(data,Filters(evidence='missing_osm',sortUse='Childcare')),[])
        self.assertEqual(search_sites(ATLAS,Filters(text='no such street')),[])
        result=search_sites(ATLAS,Filters(sortUse='Study space',limit=3))
        expected=sorted([s for s in ATLAS['sites'] if s['coverage']['hasOsm']],key=lambda s:next(u['score'] for u in s['uses'] if u['use']=='Study space'),reverse=True)[:3]
        self.assertEqual([s['id'] for s in result],[s['id'] for s in expected])

    def test_threshold_and_unknown_flags(self):
        data=copy.deepcopy(ATLAS)
        data['sites'][0]['smallArea']['population']=None
        result=search_sites(data,Filters(thresholds=[Threshold(field='population',op='gte',value=0)]))
        self.assertNotIn(data['sites'][0]['id'],[s['id'] for s in result])
        self.assertTrue(all(s['register']['protected']=='Yes' for s in search_sites(ATLAS,Filters(protected='yes'))))

    def test_top_use_is_distinct_from_sort(self):
        for site in search_sites(ATLAS,Filters(topUse='Study space')):
            self.assertEqual(next(u['score'] for u in site['uses'] if u['use']=='Study space'),max(u['score'] for u in site['uses']))

    def test_unknown_operators_and_fields_rejected(self):
        for kwargs in ({'field':'population','op':'exec','value':1},{'field':'owner','op':'eq','value':1}, {'field':'share0to14','op':'gt','value':20}):
            with self.assertRaises(ValidationError): Threshold(**kwargs)
        with self.assertRaises(ValidationError): Filters(script='anything')

    def test_comparison_and_citations_are_exact_snapshot_values(self):
        sites=[next(s for s in ATLAS['sites'] if s['id']==site_id) for site_id in ('DS1596','DS864','DS040','DS492')]
        for site in sites+[unscored_copy(sites[-1])]:
            refs=evidence_for(ATLAS,site)
            for i,use in enumerate(('Childcare','Study space','Repair workshop','Community hub')):
                self.assertEqual(refs[f'use.{i}']['value'],next(u['score'] for u in site['uses'] if u['use']==use))
            intent=Intent(kind='compare',uses=['Childcare','Study space'])
            chosen=choose_evidence(intent,refs,intent.uses)
            blocks,citations=answer_from_evidence(intent,refs,chosen,site)
            self.assertTrue({'use.0','use.1'} <= {r['id'] for r in citations})
            self.assertTrue(all(r['id'] in refs for r in citations))
            self.assertTrue(all(id in refs for b in blocks for id in b['evidenceIds']))
            if not site['coverage']['hasOsm']: self.assertIn('cannot be ranked',' '.join(b['text'] for b in blocks))
        with self.assertRaises(ValueError): answer_from_evidence(intent,refs,['invented'],site)


class AssistantApiTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(api.app)
        self.payload={'question':'Explain childcare','siteId':'DS1596','selectedUses':['Childcare'],
            'snapshotVersion':ATLAS['metadata']['schemaVersion'],'snapshotBuild':ATLAS['metadata']['generatedAt']}

    def test_origin_host_and_body_validation(self):
        self.assertEqual(self.client.post('/api/assistant/query',json=self.payload,headers={'Origin':'https://evil.example'}).status_code,403)
        self.assertEqual(self.client.get('/api/assistant/status',headers={'Host':'evil.example'}).status_code,400)
        self.assertEqual(self.client.post('/api/assistant/query',json={**self.payload,'question':'x'*20000}).status_code,413)
        self.assertEqual(self.client.post('/api/assistant/query',json={**self.payload,'selectedUses':['Childcare','Childcare']}).status_code,422)

    def test_snapshot_mismatch(self):
        with patch.object(api,'snapshot',return_value=ATLAS):
            result=self.client.post('/api/assistant/query',json={**self.payload,'snapshotBuild':'old'})
        self.assertEqual(result.status_code,409)

    def test_search_proposals_run_only_validated_python_filters(self):
        intent=Intent(kind='search',filters=Filters(evidence='scored'))
        with patch.object(api,'snapshot',return_value=ATLAS),patch.object(api,'model_json',new=AsyncMock(return_value=intent)):
            result=self.client.post('/api/assistant/query',json=self.payload)
        self.assertEqual(result.status_code,200)
        self.assertEqual(len(result.json()['matchingSiteIds']),ATLAS['metadata']['osmSiteCount'])

    def test_invalid_references_fail_closed(self):
        with patch.object(api,'snapshot',return_value=ATLAS),patch.object(api,'model_json',new=AsyncMock(return_value=EvidenceChoice(evidenceIds=['invented']))):
            result=self.client.post('/api/assistant/query',json={**self.payload,'action':'explain'})
        self.assertEqual(result.status_code,502)

    def test_unavailable_runtime(self):
        import httpx
        with patch.object(api,'snapshot',return_value=ATLAS),patch.object(api,'model_json',new=AsyncMock(side_effect=httpx.ConnectError('not running'))):
            result=self.client.post('/api/assistant/query',json=self.payload)
        self.assertEqual(result.status_code,503)

    def test_cancelled_connection_stops_task_and_releases_gate(self):
        async def run():
            finished=asyncio.Event()
            async def slow(_):
                try: await asyncio.sleep(20)
                finally: finished.set()
            request=AsyncMock()
            request.is_disconnected.side_effect=[False,True]
            with patch.object(api,'resolve',side_effect=slow):
                with self.assertRaises(api.HTTPException): await api.ask(Query(**self.payload),request)
            self.assertTrue(finished.is_set())
            self.assertFalse(api.gate.locked())
        asyncio.run(run())


if __name__=='__main__': unittest.main()
