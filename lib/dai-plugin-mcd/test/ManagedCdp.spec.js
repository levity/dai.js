import Maker from '@makerdao/dai';
import { mcdMaker, setDebtCeiling, setPrice, mint } from './helpers';
import { DGX, REP, USD_REP } from '../src';
import { ServiceRoles } from '../src/constants';

// FIXME we won't be able to reach into @makerdao/dai internals like this when
// this plugin is moved into its own module...
import TestAccountProvider from '../../../test/helpers/TestAccountProvider';

const { DAI, ETH, USD_ETH } = Maker;
const { CDP_MANAGER } = ServiceRoles;

let maker;

beforeAll(async () => {
  maker = await mcdMaker();
  await setDebtCeiling(maker, DAI(100));
});

// most of these tests assume the current account has a proxy already, which is
// true for the first account only because the testchain setup script creates it

test('prevent locking the wrong collateral type', async () => {
  const cdp = await maker.service(CDP_MANAGER).open(DGX);
  expect.assertions(1);
  try {
    await cdp.lockCollateral(REP(1));
  } catch (err) {
    expect(err.message).toMatch(/Can't lock REP in a DGX CDP/);
  }
});

describe('ETH', () => {
  beforeAll(async () => {
    await setPrice(maker, USD_ETH(150));
    await setDebtCeiling(maker, DAI(50), ETH);
  });

  test('open', async () => {
    const cdp = await maker.service(CDP_MANAGER).open(ETH);
    expect(cdp.id).toBeGreaterThan(0);
    expect(await cdp.getCollateralValue()).toEqual(ETH(0));
    expect(await cdp.getDebtValue()).toEqual(DAI(0));
  });

  test('open & lock, lock more', async () => {
    const cdp = await maker.service(CDP_MANAGER).openLockAndDraw(ETH(1));
    expect(cdp.id).toBeGreaterThan(0);
    expect(await cdp.getCollateralValue()).toEqual(ETH(1));
    expect(await cdp.getDebtValue()).toEqual(DAI(0));

    await cdp.lockCollateral(1);
    expect(await cdp.getCollateralValue()).toEqual(ETH(2));
  });

  test('open, lock, draw, get, draw more', async () => {
    const mgr = maker.service(CDP_MANAGER);
    const cdp = await mgr.openLockAndDraw(ETH(1), DAI(1));
    expect(cdp.id).toBeGreaterThan(0);
    expect(await cdp.getCollateralValue()).toEqual(ETH(1));
    expect(await cdp.getDebtValue()).toEqual(DAI(1));

    const sameCdp = mgr.getCdp(cdp.id, ETH);
    expect(await sameCdp.getCollateralValue()).toEqual(ETH(1));
    expect(await sameCdp.getDebtValue()).toEqual(DAI(1));

    await cdp.drawDai(1);
    expect(await cdp.getDebtValue()).toEqual(DAI(2));
  });

  describe('without proxy', () => {
    beforeAll(async () => {
      const account2 = TestAccountProvider.nextAccount();
      await maker.addAccount({ ...account2, type: 'privateKey' });
      maker.useAccount(account2.address);
    });

    afterAll(() => {
      maker.useAccount('default');
    });

    test('create proxy and open', async () => {
      const cdp = await maker.service(CDP_MANAGER).open(ETH);
      expect(cdp.id).toBeGreaterThan(0);
      expect(await cdp.getCollateralValue()).toEqual(ETH(0));
      expect(await cdp.getDebtValue()).toEqual(DAI(0));
    });
  });
});

describe('REP', () => {
  beforeAll(async () => {
    await mint(maker, REP(10));
    await maker.getToken('REP').approveUnlimited(await maker.currentProxy());
    await setPrice(maker, USD_REP(100));
    await setDebtCeiling(maker, DAI(50), REP);
  });

  test('open & lock, lock more, draw more', async () => {
    const cdp = await maker.service(CDP_MANAGER).openLockAndDraw(REP(1));
    expect(cdp.id).toBeGreaterThan(0);
    expect(await cdp.getCollateralValue()).toEqual(REP(1));
    expect(await cdp.getDebtValue()).toEqual(DAI(0));

    await cdp.lockCollateral(1);
    expect(await cdp.getCollateralValue()).toEqual(REP(2));

    await cdp.drawDai(1);
    expect(await cdp.getDebtValue()).toEqual(DAI(1));
  });

  test('open, lock, draw, lock & draw more', async () => {
    const cdp = await maker
      .service(CDP_MANAGER)
      .openLockAndDraw(REP(1), DAI(1));
    expect(cdp.id).toBeGreaterThan(0);
    expect(await cdp.getCollateralValue()).toEqual(REP(1));
    expect(await cdp.getDebtValue()).toEqual(DAI(1));

    await cdp.lockAndDraw(2, 3);
    expect(await cdp.getCollateralValue()).toEqual(REP(3));
    expect(await cdp.getDebtValue()).toEqual(DAI(4));
  });
});
