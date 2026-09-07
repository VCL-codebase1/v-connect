import test from 'node:test';
import assert from 'node:assert/strict';
import { providerMessageId, renderMessage, retryableStatus } from './campaign-helpers.mjs';

test('renders known variables and removes unknown placeholders',()=>assert.equal(renderMessage('Hi {{ name }}, order {{order}} {{missing}}',{name:'Ada',variables:{order:42}}),'Hi Ada, order 42 '));
test('reads common Evolution message identifiers',()=>assert.equal(providerMessageId({key:{id:'abc'}}),'abc'));
test('only retries upstream throttling and server errors',()=>{assert.equal(retryableStatus(429),true);assert.equal(retryableStatus(503),true);assert.equal(retryableStatus(400),false);});
