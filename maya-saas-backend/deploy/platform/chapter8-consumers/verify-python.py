"""Finite L06–L08 release ratchet. AST/read-only; never import production bot modules."""
import ast
import json
from pathlib import Path
import sys

FUNCTIONS = {
    'masters_ai.py': ['money_pitch'],
    'owner_ai.py': ['return_candidates', '_stored_client_retention', 'client_retention',
                    '_fallback_client_retention', '_money_at_stake', 'money_opportunities', 'risk_signals', 'plan_fact', '_fallback_plan_fact', '_financial_director', '_business_goals', '_owner_business_advisor', '_growth_engine', '_owner_briefing', '_kpi_scorecard'],
    'webhook_server.py': ['client_retention_refresh_loop'],
}

def verify(root):
    root = Path(root)
    checked = []
    for filename, names in FUNCTIONS.items():
        tree = ast.parse((root / filename).read_text())
        nodes = {n.name:n for n in tree.body if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef))}
        for name in names:
            node = nodes[name]
            calls = [n for n in ast.walk(node) if isinstance(n,ast.Call)]
            allowed = {'_fallback_client_retention'} if name == 'client_retention' else {'_fallback_plan_fact'} if name == 'plan_fact' else set()
            assert all(isinstance(n.func,ast.Name) and n.func.id in allowed for n in calls), (filename,name,'legacy effect/scoring call')
            assert not any(isinstance(n,(ast.BinOp,ast.For,ast.While,ast.Await)) for n in ast.walk(ast.Module(body=node.body,type_ignores=[]))), (filename,name,'legacy calculation/loop')
            checked.append(filename+'::'+name)
        if filename == 'owner_ai.py':
            source = ast.unparse(nodes['business_snapshot'])
            assert '_today_load()' in source and 'legacy_provider_observation' in source
            assert not any(isinstance(n,ast.BinOp) for stmt in nodes['business_snapshot'].body for n in ast.walk(stmt)), 'snapshot forecast arithmetic'
            for key in ['expected_revenue_rub','forecast_low_rub','forecast_high_rub','potential_fill_revenue_rub','potential_revenue_rub','capacity_revenue_rub']:
                assert repr(key)+': None' in source, key
            checked.append(filename+'::business_snapshot')
            assert 'Свободная ёмкость не измерена' in ast.unparse(nodes['format_daily_briefing'])
            projection=ast.unparse(nodes['_c8_legacy_projection'])
            env={};exec(compile(projection,'<c8-safe-projection>','exec'),env)
            sample={'booked_today':2,'confirmed_cash':'123','nested':{'potential_rub':999,'forecast_rub':80,'planning_confidence_pct':95},'items':[{'expected_revenue_rub':500}]}
            result=env['_c8_legacy_projection'](sample)
            assert result['booked_today']==2 and result['confirmed_cash']=='123'
            assert all(v is None for v in result['nested'].values()) and result['items'][0]['expected_revenue_rub'] is None
            assert sample['nested']['potential_rub']==999
            for caller in ['command_center','daily_briefing']:
                returns=[n for n in nodes[caller].body if isinstance(n,ast.Return)]
                assert len(returns)==1 and isinstance(returns[0].value,ast.Call) and returns[0].value.func.id=='_c8_legacy_projection',caller

            # Optional older provider-registry entrypoints must never restore stale scored snapshots.
            for name in ['_stored_client_registry_analysis','_analyze_client_registry','client_registry_analysis']:
                if name in nodes:
                    calls=[n for n in ast.walk(nodes[name]) if isinstance(n,ast.Call)]
                    assert all(isinstance(n.func,ast.Name) and n.func.id=='_fallback_client_retention' for n in calls)
                    checked.append(filename+'::'+name)
            code='from __future__ import annotations\n'+'\n'.join(ast.unparse(nodes[n]) for n in names if n!='client_retention')
            env={};exec(compile(code,'<c8-isolated-proof>','exec'),env)
            assert env['_money_at_stake']([{'potential_rub':999999}],[]) is None
            assert env['money_opportunities']({'fake':100},{},{}) == []
            result=env['return_candidates'](include_personal_data=True)
            assert result['available'] is False and result['count'] is None and not result['candidates']
            assert result['potential_return_revenue_rub'] is None
            assert all(v is None or v is False for v in env['_fallback_client_retention']()['summary'].values())
            assert env['risk_signals']()['available'] is False
    tree=ast.parse((root/'growth_planner.py').read_text())
    assert not any(isinstance(n,(ast.Import,ast.ImportFrom)) and any(x.name.split('.')[0] in {'database','yclients','analytics','requests'} for x in n.names) for n in ast.walk(tree))
    assert not any(isinstance(n,ast.BinOp) for fn in tree.body if isinstance(fn,ast.FunctionDef) for stmt in fn.body for n in ast.walk(stmt)), 'parallel growth calculator'
    env={};exec(compile(tree,'<c8-growth-isolated-proof>','exec'),env)
    for name in ['get_growth_plan','calculate_growth_plan','build_growth_plan','segment_client_base','calculate_capacity']:
        # Inspect all callable bodies, rather than inventing positional fixture requirements.
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name==name)
        assert len(fn.body)==1 and isinstance(fn.body[0],ast.Return)
    assert env['get_growth_plan']()['available'] is False
    assert env['set_growth_goal'](target_rub=100)['error']=='legacy_business_goal_mutation_retired'
    return {'status':'PASS','retiredEntrypoints':checked,'growthOwner':'RETIRED','sourceImports':0,'productionEffects':0}

if __name__=='__main__':print(json.dumps(verify(sys.argv[1])))
