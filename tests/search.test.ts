import { describe,expect,it } from 'vitest';
import { escapeLike,hasHan } from '../worker/lib/search';
describe('bilingual search query routing',()=>{
 it('detects Han queries without misrouting Latin text',()=>{expect(hasHan('智能体')).toBe(true);expect(hasHan('Anthropic agent')).toBe(false);expect(hasHan('AI 智能体')).toBe(true);});
 it('escapes LIKE wildcards and escape characters',()=>{expect(escapeLike('智能_体%\\')).toBe('智能\\_体\\%\\\\');});
});
