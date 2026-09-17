"""Build the distributable HTML; project/version data never enters this build."""
from pathlib import Path
import hashlib
import json
import re

SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[1]
PACKAGE = ROOT / 'standard/skills/week-planning'


def application_script():
    source = '\n'.join((SOURCE/name).read_text(encoding='utf-8-sig') for name in ['local-data.js','ui.js'])
    # HTML parses end tags even inside JavaScript strings or comments.
    return re.sub(r'</script', lambda match: '<\\/' + match[0][2:], source, flags=re.I)


def build():
    template = PACKAGE / 'assets/version-plan.html'
    text = template.read_text(encoding='utf-8')
    marker = '<script id="plan-app">'
    if text.count(marker) != 1:
        raise ValueError('Expected one plan-app')
    # The app is the last body element. Recreate its whole suffix, including any
    # stale text left by an earlier build that embedded an unescaped end tag.
    text = text.split(marker)[0] + marker + application_script() + '</script></body></html>\n'
    style = (SOURCE/'local.css').read_text(encoding='utf-8-sig')
    text, count = re.subn(r'(<style id="standalone-style">)[\s\S]*?(</style>)', lambda m:m[1]+style+m[2], text)
    if count != 1:
        raise ValueError('Expected one standalone-style')
    seed = json.loads((PACKAGE/'assets/data-template.json').read_text(encoding='utf-8'))
    payload = json.dumps(seed, ensure_ascii=False).replace('<', '\\u003c')
    text = re.sub(r'(<script id="plan-data" type="application/json">)[\s\S]*?(</script>)', lambda m:m[1]+payload+m[2], text)
    template.write_text(text, encoding='utf-8')
    source_style = re.search(r'<style id="se-source-style">([\s\S]*?)</style>', text)[1]
    print(json.dumps({'template':str(template),'se_style_sha256':hashlib.sha256(source_style.encode()).hexdigest()},ensure_ascii=False))


if __name__ == '__main__':
    build()
