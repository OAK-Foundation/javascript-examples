import "@imstar15/api-augment";
import { cryptoWaitReady } from '@polkadot/util-crypto';
import turingHelper from "./common/turingHelper";
import mangataHelper from "./common/mangataHelper";
import {env} from "./common/constants";
import Account from './common/account';
const {TURING_ENDPOINT,TURING_PARA_ID, MANGATA_ENDPOINT, MANGATA_PARA_ID} = env;

// const OAK_SOV_ACCOUNT = "68kxzikS2WZNkYSPWdYouqH5sEZujecVCy3TFt9xHWB5MDG5";

/**
 * Make sure you run `npm run setup` before running this file.
 * Pre-requisite from setup
 * 1. MGR-TUR pool is created and promoted
 * 2. Alice account has balances
 *   a) MGR on Mangata
 *   b) MGR-TUR liquidity token on Mangata
 *   c) Reward claimable in MGR-TUR pool <-- TODO
 *   d) TUR on Turing for transaction fees
 *   
 */
async function main () {
  await cryptoWaitReady();

  console.log("Initializing APIs of both chains ...");
  await turingHelper.initialize(TURING_ENDPOINT);
  await mangataHelper.initialize(MANGATA_ENDPOINT);

  console.log("Reading token and balance of Alice and Bob accounts ...");
  const alice = new Account("Alice");
  await alice.init();
  alice.print();

  const mangataAddress = alice.assets[1].address;
  const turingAddress = alice.assets[2].address;

  const currencyId = mangataHelper.getTokenIdBySymbol('TUR');

  const proxyExtrinsic = mangataHelper.api.tx.xyk.compoundRewards(currencyId, 1000);
  const mangataProxyCall = await mangataHelper.createProxyCall(mangataAddress, proxyExtrinsic);
  const encodedMangataProxyCall = mangataProxyCall.method.toHex(mangataProxyCall);
  const mangataProxyCallFees = await mangataProxyCall.paymentInfo(mangataAddress);

  console.log('encodedMangataProxyCall: ', encodedMangataProxyCall);
  console.log('mangataProxyCallFees: ', mangataProxyCallFees.toHuman());

  console.log(`\n1. Create the call for scheduleXcmpTask `);
  const providedId = "xcmp_automation_test_" + (Math.random() + 1).toString(36).substring(7);
  const xcmpCall =  turingHelper.api.tx.automationTime.scheduleXcmpTask(
    providedId,
    { Fixed: { executionTimes: [0] } },
    MANGATA_PARA_ID,
    0,
    encodedMangataProxyCall,
    mangataProxyCallFees.weight,
  );
  
  console.log('xcmpCall: ', xcmpCall);

  console.log(`\n2. Estimating XCM fees ...`);
  const xcmFrees = await turingHelper.getXcmFees(turingAddress, xcmpCall);
  console.log("xcmFrees:", xcmFrees.toHuman());

  // Get a TaskId from Turing rpc
  const taskId = await turingHelper.api.rpc.automationTime.generateTaskId(turingAddress, providedId);
  console.log("TaskId:", taskId.toHuman());

  console.log(`\n3. Sign and send scheduleXcmpTask call ...`);
  await turingHelper.sendXcmExtrinsic(xcmpCall, alice.keyring, taskId);

  // TODO: how do we know the task happens? Could we stream reading events on Mangata side?
  console.log(`\n4. waiting for XCM events on Mangata side ...`);
}

main().catch(console.error).finally(() => process.exit());
