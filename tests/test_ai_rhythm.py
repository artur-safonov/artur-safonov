"""Guard against false quota readings and calendar overflow in the public card."""
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location('ai_rhythm', Path(__file__).resolve().parents[1]/'scripts/ai_rhythm.py')
card = importlib.util.module_from_spec(spec)
spec.loader.exec_module(card)


def sample():
    end = dt.date(2026, 10, 24)
    start = end-dt.timedelta(days=29)
    daily = [dict(day=(start+dt.timedelta(days=i)).isoformat(), input=10, output=2, calls=3) for i in range(30)]
    return dict(version=2, start=str(start), end=str(end), daily=daily,
                calendar=[dict(day=r['day'], calls=r['calls']) for r in daily],
                sources={'usage': {'timestamp': '2026-10-24T12:00:00Z', 'ok': True}},
                quotaHistory={}, privateAccount='must not be retained')


class PublicCardTests(unittest.TestCase):
    def test_missing_quotas_are_not_zero(self):
        data = card.allowlist(sample())
        self.assertIsNone(data['quotas']['Codex']['used'])
        self.assertNotIn('privateAccount', data)
        svg = card.render(data, dt.datetime(2026, 10, 24, 12, 0, tzinfo=dt.timezone.utc))
        self.assertIn('No quota reading available', svg)
        self.assertNotIn('>0%</text>', svg)
        ET.fromstring(svg)

    def test_rejects_invalid_and_duplicate_observations(self):
        raw = sample()
        raw['daily'][1]['day'] = raw['daily'][0]['day']
        with self.assertRaises(ValueError):
            card.allowlist(raw)
        raw = sample()
        raw['quotaHistory']['Codex'] = {'points': [{'timestamp': '2026-10-24T12:00:00Z', 'used': 101}]}
        with self.assertRaises(ValueError):
            card.allowlist(raw)

    def test_stale_and_failed_sources_keep_their_reading_age(self):
        raw = sample()
        raw['quotaHistory']['Claude'] = {'points': [{'timestamp': '2026-10-23T12:00:00Z', 'used': 85}]}
        raw['sources']['quotas'] = {'Claude': {'ok': False}}
        svg = card.render(card.allowlist(raw), dt.datetime(2026, 10, 24, 12, 0, tzinfo=dt.timezone.utc))
        self.assertIn('>85%</text>', svg)
        self.assertIn('source unavailable', svg)
        self.assertIn('Oct 23', svg)
        self.assertNotIn('Avg.', svg)

    def test_a_year_of_history_stays_inside_the_calendar_column(self):
        raw = sample()
        end = dt.date.fromisoformat(raw['end'])
        raw['calendar'] = [dict(day=str(end-dt.timedelta(days=i)), calls=1) for i in reversed(range(365))]
        svg = ET.fromstring(card.render(card.allowlist(raw)))
        cells = [r for r in svg.iter('{http://www.w3.org/2000/svg}rect') if r.attrib.get('width') == '17']
        self.assertLessEqual(len(cells), 26*7)
        self.assertLessEqual(max(float(r.attrib['x'])+17 for r in cells), 718)


if __name__ == '__main__':
    unittest.main()
