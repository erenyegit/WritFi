// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {WritOptions} from "../src/WritOptions.sol";
import {PythAccumulatorAdapter} from "../src/adapters/PythAccumulatorAdapter.sol";
import {MockBTC} from "./mocks/MockBTC.sol";
import {MockUSDC} from "./mocks/MockUSDC.sol";
import {PythFixtures} from "./fixtures/PythFixtures.sol";

/// @notice The whole lifecycle against the adapter that runs on GIWA, fed the
/// real Hermes update for the Sep 24 2026 08:00 UTC expiry ($84,505.84).
contract WritOptionsPythTest is Test {
    bytes32 constant FEED_ID = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    uint256 constant SIGNER_PK = 0x5161;

    MockUSDC usdc;
    MockBTC btc;
    WritOptions core;
    address writer = makeAddr("writer");
    uint64 expiry = PythFixtures.SEP24_0800_TIME;

    function setUp() public {
        address[] memory keys = new address[](5);
        keys[0] = 0x41534bB176E461A3fb30479400f210549eCCE638;
        keys[1] = 0x6502987B62F21Cab7eb5cCd8f0173084b60d5B41;
        keys[2] = 0x44A3e8F6a382412CF6BB90A3F8106e68977476C9;
        keys[3] = 0x13Edc776d3063549fdB0702Af182Edc905A539d4;
        keys[4] = 0x3af088854bB768065f4929e5BbdfA4Cbb04C9aF9;
        PythAccumulatorAdapter adapter = new PythAccumulatorAdapter(
            FEED_ID,
            1,
            keys,
            26,
            0x507974686e6574507974686e6574507974686e6574507974686e657450797468,
            1 hours,
            100,
            address(this)
        );

        usdc = new MockUSDC();
        btc = new MockBTC();
        core = new WritOptions(address(usdc), address(btc), address(adapter));
        core.registerMaker(address(this), vm.addr(SIGNER_PK));

        usdc.mint(address(this), 100_000e6);
        btc.mint(address(this), 10e8);
        usdc.approve(address(core), type(uint256).max);
        btc.approve(address(core), type(uint256).max);
        core.depositMakerUsdc(100_000e6);
        core.depositMakerBtc(10e8);

        usdc.mint(writer, 10_000e6);
        btc.mint(writer, 1e8);
        vm.startPrank(writer);
        usdc.approve(address(core), type(uint256).max);
        btc.approve(address(core), type(uint256).max);
        vm.stopPrank();

        vm.warp(expiry - 1 days);
    }

    function _write(bool isPut, uint64 strike, uint128 premium) internal returns (uint256) {
        WritOptions.Quote memory q = WritOptions.Quote({
            writer: writer,
            maker: address(this),
            isPut: isPut,
            strike: strike,
            qty: 1e6, // 0.01 BTC
            expiry: expiry,
            premium: premium,
            quoteDeadline: uint64(block.timestamp + 20),
            nonce: uint256(keccak256(abi.encode(isPut, strike)))
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(SIGNER_PK, core.hashQuote(q));
        vm.prank(writer);
        return core.writeOption(q, abi.encodePacked(r, s, v));
    }

    function test_SettlesBothProductsAtTheRealExpiryPrice() public {
        uint256 put = _write(true, 85_000e8, 9e6); // strike above $84,505.84: assigned
        uint256 call = _write(false, 86_000e8, 7e6); // strike above spot: not assigned

        uint256 writerBtc = btc.balanceOf(writer);
        uint256 writerUsdc = usdc.balanceOf(writer);

        vm.warp(expiry + 10 minutes);
        bytes[] memory updates = new bytes[](1);
        updates[0] = PythFixtures.SEP24_0800;
        uint256[] memory ids = new uint256[](2);
        ids[0] = put;
        ids[1] = call;
        core.settleMany(ids, abi.encode(updates));

        WritOptions.Position memory p = core.getPosition(put);
        WritOptions.Position memory c = core.getPosition(call);
        assertEq(p.settlementPrice, 8_450_584_233_677);
        assertTrue(p.assigned, "put below its strike buys the BTC");
        assertFalse(c.assigned, "call below its strike keeps the BTC");

        // Put writer receives 0.01 BTC; call writer gets 0.01 BTC back.
        assertEq(btc.balanceOf(writer), writerBtc + 2e6);
        // The put's 850 USDC went to the maker; nothing in cash comes back.
        assertEq(usdc.balanceOf(writer), writerUsdc);

        assertEq(
            usdc.balanceOf(address(core)),
            core.makerUsdcFree() + core.makerUsdcReserved() + core.writerUsdcCollateral()
        );
        assertEq(
            btc.balanceOf(address(core)),
            core.makerBtcFree() + core.makerBtcReserved() + core.writerBtcCollateral()
        );
    }

    function test_CannotSettleWithAnotherExpirysPrice() public {
        uint256 put = _write(true, 85_000e8, 9e6);
        vm.warp(expiry + 1 days);
        bytes[] memory updates = new bytes[](1);
        updates[0] = PythFixtures.SEP23_0800; // the day before
        vm.expectRevert(PythAccumulatorAdapter.PriceNotInWindow.selector);
        core.settle(put, abi.encode(updates));
    }
}
