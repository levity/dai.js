import assert from 'assert';
import Maker from '@makerdao/dai';
import McdPlugin from '../src';
import { ServiceRoles } from '../src/constants';
import ethAbi from 'web3-eth-abi';
import { getIlkForCurrency } from '../src/utils';
const {
  utils: { stringToBytes32 }
} = Maker;

export async function mcdMaker(settings) {
  const maker = await Maker.create('test', {
    plugins: [McdPlugin],
    log: false,
    ...settings
  });
  await maker.authenticate();
  return maker;
}

export async function setPrice(maker, ratio) {
  const scs = maker.service('smartContract');
  const { symbol } = ratio.denominator;
  const pip = scs.getContract('PIP_' + symbol);

  // using uint here instead of bytes32 so it gets left-padded
  const val = ethAbi.encodeParameter('uint', ratio.toEthersBigNumber('wei'));
  await pip.poke(val);

  const spot = scs.getContract('MCD_SPOT_' + symbol);
  await spot.poke();

  const data = maker.service(ServiceRoles.SYSTEM_DATA);
  const ilk = await data.pit.ilks(getIlkForCurrency(ratio.denominator));
  assert(ratio.toEthersBigNumber('ray').eq(ilk.spot));
}

export async function setDebtCeiling(maker, amount, currency) {
  const scs = maker.service('smartContract');
  const momLib = scs.getContract('MCD_MOM_LIB');

  const method = currency
    ? 'file(address,bytes32,bytes32,uint256)'
    : 'file(address,bytes32,uint256)';

  // this will fail silently if we have the wrong address for MCD_MOM_LIB
  await momLib[method](
    ...[
      scs.getContractAddress('MCD_PIT'),
      currency && getIlkForCurrency(currency),
      stringToBytes32(currency ? 'line' : 'Line', false),
      ethAbi.encodeParameter('uint', amount.toEthersBigNumber('wei')),
      { dsProxy: scs.getContractAddress('MCD_MOM') }
    ].filter(x => x)
  );

  const data = maker.service(ServiceRoles.SYSTEM_DATA);
  if (currency) {
    const { line } = await data.pit.ilks(getIlkForCurrency(currency));
    assert(
      amount.toEthersBigNumber('wei').eq(line),
      "Debt ceiling didn't change. We may have the wrong address for MomLib"
    );
  } else {
    const Line = await data.pit.Line();
    assert(
      amount.toEthersBigNumber('wei').eq(Line),
      "Debt ceiling didn't change. We may have the wrong address for MomLib"
    );
  }
}

export async function mint(maker, amount) {
  // the current account must own the token contract
  const token = maker.getToken(amount.symbol);
  await token._contract['mint(uint256)'](amount.toEthersBigNumber('wei'));
  expect(await token.balance()).toEqual(amount);
}
